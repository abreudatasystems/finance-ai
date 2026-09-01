"""Fiscal module — IVA summary and SAF-T (PT) export."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.services.vat_engine import compute_vat_position, compute_real_cash
from app.models.models import Transaction, Company, Supplier, Customer

router = APIRouter()


@router.get("/vat-position")
def get_vat_position(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Apuramento do IVA: liquidado − dedutível, with the statutory deadlines."""
    return compute_vat_position(db, company_id, period)


@router.get("/real-cash")
def get_real_cash(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Cash split into what belongs to the company and what belongs to the State."""
    return compute_real_cash(db, company_id)


def _to_float(val) -> float:
    return float(val) if val else 0.0


@router.get("/vat-summary")
def get_vat_summary(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """IVA summary by rate.

    Delegates to the apuramento so sales and purchases stay separated — adding
    IVA liquidado to IVA dedutível produces a figure that means nothing.
    """
    position = compute_vat_position(db, company_id, period)
    return {
        "period": position["period"]["key"],
        "period_label": position["period"]["label"],
        "regime": position["regime"],
        "breakdown": position["iva_liquidado"]["breakdown"] + position["iva_dedutivel"]["breakdown"],
        "iva_liquidado": position["iva_liquidado"],
        "iva_dedutivel": position["iva_dedutivel"],
        "apuramento": position["apuramento"],
        "prazos": position["prazos"],
        "totals": {
            "base_tributavel": round(
                position["iva_liquidado"]["base_tributavel"] + position["iva_dedutivel"]["base_tributavel"], 2),
            "iva_total": position["apuramento"]["saldo"],
            "num_documentos": position["iva_liquidado"]["num_documentos"] + position["iva_dedutivel"]["num_documentos"],
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
