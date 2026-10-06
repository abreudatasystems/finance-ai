"""Orçamento — the plan, and how the month is measuring up against it."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.db.session import get_db
from app.models.models import Budget, User
from app.services import budgets as service

router = APIRouter()


class BudgetSet(BaseModel):
    category_id: str
    period: Optional[str] = None       # AAAA-MM, defaults to the current month
    amount: float
    notes: Optional[str] = None


class BudgetBatch(BaseModel):
    period: Optional[str] = None
    linhas: List[BudgetSet]


class CopyRequest(BaseModel):
    origem: str
    destino: str


@router.get("/")
def list_budgets(
    period: Optional[str] = Query(None, description="AAAA-MM; por omissão, o mês corrente."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The plan itself, for one month."""
    period = period or service.current_period()
    service.parse_period(period)
    rows = (
        db.query(Budget)
        .filter(Budget.company_id == company_id, Budget.period == period)
        .order_by(Budget.type.desc(), Budget.category_name)
        .all()
    )
    return {"periodo": period, "linhas": [service.serialize(b) for b in rows]}


@router.get("/comparison")
def budget_comparison(
    period: Optional[str] = Query(None, description="AAAA-MM; por omissão, o mês corrente."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Plan against reality, category by category, on the same basis as the DRE."""
    return service.compare(db, company_id, period or service.current_period())


@router.get("/year")
def budget_year(
    year: Optional[int] = Query(None, description="Por omissão, o ano corrente."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Twelve months side by side."""
    return service.year(db, company_id, year or date.today().year)


@router.put("/")
def set_budget(
    item: BudgetSet,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Plan one category for one month, or change what is already planned."""
    return service.set_budget(
        db, company_id, item.category_id, item.period or service.current_period(),
        item.amount, item.notes, current_user.name,
    )


@router.put("/batch")
def set_many(
    body: BudgetBatch,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Save a whole month in one go — how a budget is actually filled in."""
    period = body.period or service.current_period()
    saved = [
        service.set_budget(db, company_id, line.category_id, line.period or period,
                           line.amount, line.notes, current_user.name)
        for line in body.linhas
    ]
    return {"periodo": period, "guardados": len(saved), "linhas": saved}


@router.post("/copy")
def copy_budget(
    body: CopyRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Carry a month's plan into another one, leaving existing decisions alone."""
    return service.copy_period(db, company_id, body.origem, body.destino, current_user.name)


@router.delete("/{budget_id}")
def delete_budget(
    budget_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    return service.remove(db, company_id, budget_id)
