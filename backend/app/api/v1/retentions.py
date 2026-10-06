"""Retenções na fonte — the position, the documents, and the annual base.

Read-only except for the counterparty default, which is the one thing worth
storing: a supplier's withholding is a property of the supplier, and typing it
on every invoice is how it ends up wrong.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.catalog import retentions as catalog
from app.db.session import get_db
from app.models.models import Entity, Transaction, User
from app.services import retentions as service

router = APIRouter()

VALID_SIDES = {"expense", "income"}


class EntityDefault(BaseModel):
    retention_code: Optional[str] = None


def _reference(today: Optional[str]) -> Optional[date]:
    if not today:
        return None
    try:
        return date.fromisoformat(today[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Data inválida: '{today}'. Use AAAA-MM-DD.")


@router.get("/types")
def retention_types(
    side: Optional[str] = Query(None, description="expense ou income"),
):
    """The withholdings that can be picked, with the article each comes from."""
    if side and side not in VALID_SIDES:
        raise HTTPException(status_code=400, detail="Use 'expense' ou 'income'.")
    return {
        "tipos": service.catalogue(side),
        "nota": (
            "Taxas por omissão, revistas em Orçamento do Estado. Pode indicar "
            "outra taxa em cada documento. Confirme com o contabilista."
        ),
    }


@router.get("/position")
def retention_position(
    period: Optional[str] = Query(None, description="AAAA-MM; por omissão, o mês corrente."),
    today: Optional[str] = Query(None, description="Só para testes."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """What was withheld in a month, what is owed to the State, and by when."""
    return service.position(db, company_id, period, _reference(today))


@router.get("/pending")
def pending_deliveries(
    today: Optional[str] = Query(None, description="Só para testes."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Every month still owing a delivery, oldest first."""
    reference = _reference(today)
    rows = service.outstanding_deliveries(db, company_id, reference)
    return {
        "hoje": (reference or date.today()).isoformat(),
        "entregas": rows,
        "total": round(sum(row["valor"] for row in rows), 2),
        "em_atraso": round(sum(row["valor"] for row in rows if row["em_atraso"]), 2),
    }


@router.get("/documents")
def retention_documents(
    side: Optional[str] = Query(None, description="expense ou income"),
    period: Optional[str] = Query(None, description="AAAA-MM"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The documents that carry a withholding, separated from the rest.

    The whole point of the filter: a company needs to see its retained
    invoices as their own set, because they are the ones the delivery and the
    annual declaration are built from.
    """
    if side and side not in VALID_SIDES:
        raise HTTPException(status_code=400, detail="Use 'expense' ou 'income'.")

    query = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.status.notin_(service.EXCLUDED_STATUSES),
            Transaction.retention_amount.isnot(None),
            Transaction.retention_amount > 0,
        )
    )
    if side:
        query = query.filter(Transaction.type == side)
    if period:
        start, end = service.parse_period(period)
        query = query.filter(Transaction.date >= start, Transaction.date <= end)

    rows = query.order_by(Transaction.date.desc()).all()
    return {
        "periodo": period,
        "tipo": side,
        "documentos": [service._row(t) for t in rows],
        "total_retido": round(sum(float(t.retention_amount or 0) for t in rows), 2),
    }


@router.get("/by-entity")
def retention_by_entity(
    year: Optional[int] = Query(None, description="Por omissão, o ano corrente."),
    side: str = Query("expense", description="expense ou income"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """A year of withholdings per counterparty — the base for the declaration."""
    return service.by_entity(db, company_id, year or date.today().year, side)


@router.put("/entities/{entity_id}/default")
def set_entity_default(
    entity_id: str,
    body: EntityDefault,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Set the withholding this counterparty usually carries.

    Proposed on every document from then on, so the accountant's 25% is typed
    once rather than remembered twelve times a year.
    """
    entity = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.company_id == company_id)
        .first()
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entidade não encontrada")

    code = body.retention_code or None
    if code and not catalog.get(code):
        raise HTTPException(status_code=400, detail=f"Tipo de retenção desconhecido: '{code}'.")

    entity.default_retention_code = code
    db.commit()
    db.refresh(entity)

    entry = catalog.get(entity.default_retention_code)
    return {
        "entity_id": entity.id,
        "entidade": entity.name,
        "retention_code": entity.default_retention_code,
        "label": entry.label if entry else None,
        "taxa": float(entry.rate) if entry else None,
    }
