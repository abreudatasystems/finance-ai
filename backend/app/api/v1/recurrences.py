"""Recurrences API — thin layer over app/services/recurrences.py.

Generation is idempotent per period, so ``POST /recurrences/run`` is safe to
call from a scheduler, from the UI, or twice by accident.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.db.session import get_db
from app.models.models import User
from app.services import recurrences as service

router = APIRouter()


class RecurrenceIn(BaseModel):
    name: str
    type: str = "expense"
    description: str
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    amount: float
    vat_rate: Optional[float] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    frequency: str = "monthly"
    interval: int = 1
    day_of_month: Optional[int] = None
    start_date: str
    end_date: Optional[str] = None
    lead_days: int = 0


class RecurrencePatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    amount: Optional[float] = None
    vat_rate: Optional[float] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    frequency: Optional[str] = None
    interval: Optional[int] = None
    day_of_month: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    lead_days: Optional[int] = None
    active: Optional[bool] = None


class RunRequest(BaseModel):
    #: Generate up to this date; defaults to today. Never generates the future.
    until: Optional[str] = None
    recurrence_id: Optional[str] = None


class SkipRequest(BaseModel):
    period: str


@router.get("/")
def list_recurrences(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    from app.models.models import Recurrence
    rows = (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id)
        .order_by(Recurrence.active.desc(), Recurrence.name)
        .all()
    )
    return [service.serialize(r) for r in rows]


@router.get("/upcoming")
def upcoming(
    days: int = Query(60, ge=1, le=365),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """What is coming and not yet booked — declared before /{id}."""
    return service.upcoming(db, company_id, days)


@router.post("/", status_code=201)
def create_recurrence(
    body: RecurrenceIn,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    return service.serialize(service.create(db, company_id, body.model_dump()))


@router.post("/run")
def run_generation(
    body: Optional[RunRequest] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Book every period that is due and not yet booked."""
    body = body or RunRequest()
    until = date.fromisoformat(body.until) if body.until else None
    return service.run(db, company_id, until, current_user.name, body.recurrence_id)


@router.get("/{recurrence_id}")
def get_recurrence(
    recurrence_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    rec = service.scoped(db, company_id, recurrence_id)
    return {
        "recorrencia": service.serialize(rec),
        "historico": service.history(db, company_id, recurrence_id),
    }


@router.patch("/{recurrence_id}")
def update_recurrence(
    recurrence_id: str,
    patch: RecurrencePatch,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    rec = service.update(db, company_id, recurrence_id, patch.model_dump(exclude_unset=True))
    return service.serialize(rec)


@router.delete("/{recurrence_id}")
def delete_recurrence(
    recurrence_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Deletes a rule that never fired; otherwise pauses it."""
    return service.remove(db, company_id, recurrence_id)


@router.post("/{recurrence_id}/skip")
def skip_period(
    recurrence_id: str,
    body: SkipRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Record that one period is deliberately not booked."""
    return service.skip(db, company_id, recurrence_id, body.period)
