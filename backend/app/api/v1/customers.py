from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Customer

router = APIRouter()

@router.get("/")
def get_customers(company_id: str = "COMP001", db: Session = Depends(get_db)):
    return db.query(Customer).filter(Customer.company_id == company_id).all()
