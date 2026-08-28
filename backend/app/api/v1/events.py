from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import FinancialEvent

router = APIRouter()


@router.get("/")
def get_events(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return db.query(FinancialEvent).filter(FinancialEvent.company_id == company_id).all()
