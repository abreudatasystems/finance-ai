"""Primeiros passos — what still has to be done, and whether to trust the numbers."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id
from app.db.session import get_db
from app.services import onboarding as service

router = APIRouter()


@router.get("/")
def onboarding_status(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The checklist, in the order that unlocks the most."""
    return service.status(db, company_id)


@router.get("/readiness")
def onboarding_readiness(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Per-area "is there anything to say yet", for honest empty states."""
    return service.readiness(db, company_id)
