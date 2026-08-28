from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import AuditLog

router = APIRouter()

@router.get("/")
def get_audit_logs(company_id: str = "COMP001", db: Session = Depends(get_db)):
    return db.query(AuditLog).filter(AuditLog.company_id == company_id).order_by(AuditLog.timestamp.desc()).all()
