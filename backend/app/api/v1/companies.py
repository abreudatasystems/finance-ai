from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Company

router = APIRouter()

@router.get("/")
@router.get("")
def get_companies(db: Session = Depends(get_db)):
    return db.query(Company).all()
