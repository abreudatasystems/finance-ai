from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import AIRule, Company

router = APIRouter()

@router.get("/rules")
def get_ai_rules(company_id: str = "COMP001", db: Session = Depends(get_db)):
    return db.query(AIRule).filter(AIRule.company_id == company_id).all()
