from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import FinancialEvent

router = APIRouter()

@router.get("/")
def get_events(company_id: str = "COMP001", db: Session = Depends(get_db)):
    return db.query(FinancialEvent).filter(FinancialEvent.company_id == company_id).all()
