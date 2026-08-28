from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import Company, UserMembership, User

router = APIRouter()


@router.get("/")
@router.get("")
def get_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only return companies the authenticated user actually belongs to.
    company_ids = [
        m.company_id
        for m in db.query(UserMembership).filter(UserMembership.user_id == current_user.id).all()
    ]
    if not company_ids:
        return []
    return db.query(Company).filter(Company.id.in_(company_ids)).all()
