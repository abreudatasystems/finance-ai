"""Reports and the accounting export.

The export is what turns this from an internal tool into something that
replaces work the company pays for: the period's movements with the SNC
account and the VAT split, in a file the accountant can open.
"""

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Transaction
from app.services import accounting_export as export_service

router = APIRouter()


@router.get("/export/csv")
def export_csv_report(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    transactions = db.query(Transaction).filter(Transaction.company_id == company_id).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Data", "Tipo", "Descricao", "Entidade", "Categoria", "Valor", "Status", "Origem"])
    for t in transactions:
        writer.writerow([t.date, t.type, t.description, t.entity_name, t.category_name, t.amount, t.status, t.source])

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="relatorio_financeiro.csv"'},
    )


@router.get("/accounting")
def accounting_package(
    period: Optional[str] = Query(None, description="2026-08, 2026-T3 ou 2026"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The whole package as JSON: ledger, VAT per rate, apuramento, deadlines."""
    return export_service.build(db, company_id, period)


@router.get("/accounting/ledger.csv")
def accounting_ledger_csv(
    period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The movements, line by line where the document has lines."""
    package = export_service.build(db, company_id, period)
    body = export_service.to_csv(package["razao"], export_service.LEDGER_HEADERS)
    name = export_service.filename("razao", package["empresa"]["nome"], package["periodo"]["key"])
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/accounting/vat.csv")
def accounting_vat_csv(
    period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The VAT return's figures, per rate and side, plus the apuramento."""
    package = export_service.build(db, company_id, period)
    body = export_service.to_csv(package["iva"], export_service.VAT_HEADERS)
    name = export_service.filename("iva", package["empresa"]["nome"], package["periodo"]["key"])
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
