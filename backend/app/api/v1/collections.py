"""Cobranças — the screen for getting paid.

Read-only except for the reminder draft, which composes a chaser but does not
send it: sending on a company's behalf to its own clients is a decision the
person makes, not a side effect of opening a page.
"""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id
from app.db.session import get_db
from app.models.models import Company, Transaction
from app.services import collections as service

router = APIRouter()

VALID_KINDS = {"income", "expense"}


class ReminderRequest(BaseModel):
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    transaction_ids: List[str] = []


def _reference(today: Optional[str]) -> Optional[date]:
    """Only tests pass a day; everyone else gets the real one."""
    if not today:
        return None
    try:
        return date.fromisoformat(today[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Data inválida: '{today}'. Use AAAA-MM-DD.")


@router.get("/")
def collections_overview(
    today: Optional[str] = Query(None, description="Só para testes."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Both sides at once: what is owed to the company and what it owes."""
    return service.overview(db, company_id, _reference(today))


@router.get("/aging")
def aging(
    kind: str = Query("income", description="income (a receber) ou expense (a pagar)"),
    today: Optional[str] = Query(None, description="Só para testes."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Antiguidade de saldos, by bucket, by entity and document by document."""
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Use 'income' ou 'expense'.")
    return service.aging(db, company_id, kind, _reference(today))


@router.get("/behaviour")
def behaviour(
    kind: str = Query("income"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """How long each counterparty actually takes, from its settled history."""
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Use 'income' ou 'expense'.")
    stats = service.payment_behaviour(db, company_id, kind)
    return {
        "tipo": kind,
        "entidades": sorted(
            [{"chave": key, **value} for key, value in stats.items()],
            key=lambda row: -row["atraso_medio"],
        ),
    }


@router.post("/reminder")
def reminder(
    body: ReminderRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Draft a chaser for the documents given. Composes; never sends."""
    if not body.transaction_ids:
        raise HTTPException(status_code=400, detail="Indique pelo menos um documento.")

    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.id.in_(body.transaction_ids),
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Nenhum dos documentos foi encontrado.")

    company = db.query(Company).filter(Company.id == company_id).first()
    documents = [
        {
            "documento": trx.document_number,
            "descricao": trx.description,
            "vencimento": trx.due_date,
            "em_falta": float(service._d(trx.outstanding_amount)),
        }
        for trx in rows
    ]
    entity_name = body.entity_name or rows[0].entity_name or "Cliente"
    draft = service.reminder_message(
        company.name if company else "A empresa", entity_name, documents,
    )
    draft["contacto"] = service.contact_details(db, company_id, body.entity_id or rows[0].entity_id)
    return draft
