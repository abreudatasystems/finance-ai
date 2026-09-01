from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
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


class CompanyUpdate(BaseModel):
    """Company profile, including the Portuguese tax settings."""
    name: Optional[str] = None
    nif: Optional[str] = None
    currency: Optional[str] = None
    fiscal_year_start: Optional[str] = None
    country: Optional[str] = None
    legal_form: Optional[str] = None
    vat_regime: Optional[str] = None        # normal | isencao_art53
    vat_periodicity: Optional[str] = None   # monthly | quarterly
    cae: Optional[str] = None


VALID_REGIMES = {"normal", "isencao_art53"}
VALID_PERIODICITY = {"monthly", "quarterly"}


@router.patch("/{company_id}")
def update_company(
    company_id: str,
    patch: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == current_user.id, UserMembership.company_id == company_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Apenas owner ou admin pode alterar a empresa")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    data = patch.model_dump(exclude_unset=True)
    if "vat_regime" in data and data["vat_regime"] not in VALID_REGIMES:
        raise HTTPException(status_code=400, detail="Regime de IVA inválido")
    if "vat_periodicity" in data and data["vat_periodicity"] not in VALID_PERIODICITY:
        raise HTTPException(status_code=400, detail="Periodicidade inválida")

    for field, value in data.items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company
