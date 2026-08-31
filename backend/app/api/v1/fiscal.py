"""Fiscal module — IVA summary and SAF-T (PT) export."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Transaction, Company, Supplier, Customer

router = APIRouter()


def _to_float(val) -> float:
    return float(val) if val else 0.0


@router.get("/vat-summary")
def get_vat_summary(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """IVA (VAT) summary broken down by tax rate for the given period."""
    today = datetime.utcnow().date()
    if period:
        # period = "2026-08" or "2026"
        date_start = period + "-01" if len(period) == 7 else period + "-01-01"
        if len(period) == 7:
            month = int(period.split("-")[1])
            year = int(period.split("-")[0])
            if month == 12:
                date_end = f"{year + 1}-01-01"
            else:
                date_end = f"{year}-{month + 1:02d}-01"
        else:
            date_end = f"{int(period) + 1}-01-01"
    else:
        date_start = today.replace(day=1).isoformat()
        date_end = today.isoformat()

    rows = (
        db.query(
            Transaction.vat_rate,
            func.coalesce(func.sum(Transaction.net_amount), 0).label("base_tributavel"),
            func.coalesce(func.sum(Transaction.vat_amount), 0).label("iva_total"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total_bruto"),
            func.count(Transaction.id).label("num_docs"),
        )
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= date_start,
            Transaction.date <= date_end,
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .group_by(Transaction.vat_rate)
        .order_by(Transaction.vat_rate.desc())
        .all()
    )

    vat_labels = {
        23.0: "Taxa Normal (23%)",
        13.0: "Taxa Intermédia (13%)",
        6.0: "Taxa Reduzida (6%)",
        0.0: "Isento / 0%",
        None: "Sem IVA definido",
    }

    breakdown = []
    total_base = 0.0
    total_iva = 0.0
    total_bruto = 0.0
    total_docs = 0

    for row in rows:
        rate = row.vat_rate
        base = _to_float(row.base_tributavel)
        iva = _to_float(row.iva_total)
        bruto = _to_float(row.total_bruto)
        docs = row.num_docs

        total_base += base
        total_iva += iva
        total_bruto += bruto
        total_docs += docs

        label = vat_labels.get(rate, f"Taxa {rate}%" if rate else "Sem IVA")
        breakdown.append({
            "vat_rate": rate,
            "label": label,
            "base_tributavel": round(base, 2),
            "iva_total": round(iva, 2),
            "total_bruto": round(bruto, 2),
            "num_documentos": docs,
        })

    return {
        "period": period or today.strftime("%Y-%m"),
        "breakdown": breakdown,
        "totals": {
            "base_tributavel": round(total_base, 2),
            "iva_total": round(total_iva, 2),
            "total_bruto": round(total_bruto, 2),
            "num_documentos": total_docs,
        },
    }


@router.get("/saft-export")
def export_saft_xml(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Generate a simplified SAF-T (PT) XML file."""
    company = db.query(Company).filter(Company.id == company_id).first()
    now = datetime.utcnow()

    today = now.date()
    if period:
        date_start = period + "-01" if len(period) == 7 else period + "-01-01"
        if len(period) == 7:
            month = int(period.split("-")[1])
            year = int(period.split("-")[0])
            if month == 12:
                date_end = f"{year + 1}-01-01"
            else:
                date_end = f"{year}-{month + 1:02d}-01"
        else:
            date_end = f"{int(period) + 1}-01-01"
    else:
        date_start = today.replace(month=1, day=1).isoformat()
        date_end = today.isoformat()

    # Suppliers
    suppliers = db.query(Supplier).filter(Supplier.company_id == company_id).all()
    # Customers
    customers = db.query(Customer).filter(Customer.company_id == company_id).all()
    # Transactions
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= date_start,
            Transaction.date <= date_end,
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .order_by(Transaction.date)
        .all()
    )

    company_name = company.name if company else "Empresa"
    company_nif = company.nif if company else "000000000"
    fiscal_year = period[:4] if period else str(today.year)

    xml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">',
        '  <Header>',
        f'    <AuditFileVersion>1.04_01</AuditFileVersion>',
        f'    <CompanyID>{company_nif}</CompanyID>',
        f'    <TaxRegistrationNumber>{company_nif}</TaxRegistrationNumber>',
        f'    <TaxAccountingBasis>F</TaxAccountingBasis>',
        f'    <CompanyName>{company_name}</CompanyName>',
        f'    <FiscalYear>{fiscal_year}</FiscalYear>',
        f'    <StartDate>{date_start}</StartDate>',
        f'    <EndDate>{date_end}</EndDate>',
        f'    <CurrencyCode>EUR</CurrencyCode>',
        f'    <DateCreated>{now.strftime("%Y-%m-%d")}</DateCreated>',
        f'    <TaxEntity>Global</TaxEntity>',
        f'    <ProductCompanyTaxID>000000000</ProductCompanyTaxID>',
        f'    <SoftwareCertificateNumber>0</SoftwareCertificateNumber>',
        f'    <ProductID>FinanceAI/1.0</ProductID>',
        f'    <ProductVersion>1.0</ProductVersion>',
        '  </Header>',
        '  <MasterFiles>',
    ]

    # Customers
    xml_parts.append('    <Customer>')
    for c in customers:
        xml_parts.extend([
            f'      <CustomerID>{c.id}</CustomerID>',
            f'      <CustomerTaxID>{c.nif or "999999990"}</CustomerTaxID>',
            f'      <CompanyName>{c.name}</CompanyName>',
        ])
    xml_parts.append('    </Customer>')

    # Suppliers
    xml_parts.append('    <Supplier>')
    for s in suppliers:
        xml_parts.extend([
            f'      <SupplierID>{s.id}</SupplierID>',
            f'      <SupplierTaxID>{s.nif or "999999990"}</SupplierTaxID>',
            f'      <CompanyName>{s.name}</CompanyName>',
        ])
    xml_parts.append('    </Supplier>')

    xml_parts.extend([
        '  </MasterFiles>',
        '  <SourceDocuments>',
        '    <SalesInvoices>',
        f'      <NumberOfEntries>{len([t for t in transactions if t.type == "income"])}</NumberOfEntries>',
        f'      <TotalDebit>0.00</TotalDebit>',
        f'      <TotalCredit>{sum(_to_float(t.amount) for t in transactions if t.type == "income"):.2f}</TotalCredit>',
    ])

    for trx in transactions:
        if trx.type == "income":
            xml_parts.extend([
                '      <Invoice>',
                f'        <InvoiceNo>{trx.document_number or trx.id}</InvoiceNo>',
                f'        <InvoiceDate>{trx.date}</InvoiceDate>',
                f'        <CustomerID>{trx.entity_id or "GENERIC"}</CustomerID>',
                '        <Line>',
                f'          <Description>{trx.description}</Description>',
                f'          <CreditAmount>{_to_float(trx.net_amount or trx.amount):.2f}</CreditAmount>',
                '          <Tax>',
                f'            <TaxPercentage>{_to_float(trx.vat_rate):.2f}</TaxPercentage>',
                f'            <TaxAmount>{_to_float(trx.vat_amount):.2f}</TaxAmount>',
                '          </Tax>',
                '        </Line>',
                f'        <DocumentTotals>',
                f'          <NetTotal>{_to_float(trx.net_amount or trx.amount):.2f}</NetTotal>',
                f'          <TaxPayable>{_to_float(trx.vat_amount):.2f}</TaxPayable>',
                f'          <GrossTotal>{_to_float(trx.amount):.2f}</GrossTotal>',
                f'        </DocumentTotals>',
                '      </Invoice>',
            ])

    xml_parts.extend([
        '    </SalesInvoices>',
        '  </SourceDocuments>',
        '</AuditFile>',
    ])

    xml_content = "\n".join(xml_parts)
    filename = f"SAFT-PT_{company_nif}_{fiscal_year}.xml"

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
