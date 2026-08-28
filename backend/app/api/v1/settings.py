from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import AIRule

router = APIRouter()


@router.get("/rules")
def get_ai_rules(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return db.query(AIRule).filter(AIRule.company_id == company_id).all()
