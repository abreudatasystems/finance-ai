from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.models import Supplier

router = APIRouter()

@router.get("/")
def get_suppliers(company_id: str = "COMP001", db: Session = Depends(get_db)):
    return db.query(Supplier).filter(Supplier.company_id == company_id).all()
