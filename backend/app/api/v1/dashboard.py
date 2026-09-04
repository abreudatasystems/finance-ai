from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
    year: Optional[int] = Query(None, description="Ano fiscal completo; ignora `months`."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Rendimentos, gastos e resultado por mês, sem IVA e em regime de acréscimo.

    Sem ``year``, uma janela dos últimos ``months`` meses — o que um painel
    quer. Com ``year``, os doze meses desse ano — o que um relatório quer, e
    sem o qual um gráfico rotulado "Ano Fiscal 2026" mostrava os últimos seis
    meses e chamava-lhes um ano.
    """
    if year is not None and not 1990 <= year <= 2200:
        raise HTTPException(status_code=400, detail="Ano fora do intervalo aceitável.")
    return get_monthly_summary(company_id, db, months, year)


@router.get("/expenses-by-category")
def get_dashboard_expenses_by_category(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Expense breakdown by category for the current month."""
    return get_expenses_by_category(company_id, db)
