from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.services.health_calculator import (
    calculate_health_score,
    get_monthly_summary,
    get_expenses_by_category,
)

router = APIRouter()


@router.get("/health-score")
def get_health_score(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return calculate_health_score(company_id, db)


@router.get("/summary")
def get_dashboard_summary(
    months: int = 6,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Monthly income/expense/result for the last N months."""
    return get_monthly_summary(company_id, db, months)


@router.get("/expenses-by-category")
def get_dashboard_expenses_by_category(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Expense breakdown by category for the current month."""
    return get_expenses_by_category(company_id, db)
