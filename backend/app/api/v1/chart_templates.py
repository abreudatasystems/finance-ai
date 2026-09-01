"""Chart-of-accounts templates: list what is available and restore the standard plan."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user
from app.catalog.registry import get_template, list_templates
from app.db.session import get_db
from app.models.models import Company, User, UserMembership
from app.services.provisioning import restore_defaults

router = APIRouter()


class RestoreRequest(BaseModel):
    template_code: Optional[str] = None


@router.get("/")
def get_chart_templates(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Available plans, flagging the one this company is on."""
    company = db.query(Company).filter(Company.id == company_id).first()
    active = company.chart_template if company else None
    return [
        {**t.as_dict(), "active": t.code == active}
        for t in list_templates()
    ]


@router.get("/{code}")
def get_chart_template(code: str):
    """Preview a plan without applying it."""
    template = get_template(code)
    if template.code != code:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return template.as_dict()


@router.post("/restore")
def restore_chart(
    body: Optional[RestoreRequest] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
):
    """Re-add the standard categories that are missing.

    Non-destructive: categories the company renamed or created itself are left
    untouched, and only the gaps are filled.
    """
    member = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == current_user.id, UserMembership.company_id == company_id)
        .first()
    )
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Apenas owner ou admin pode repor o plano")

    result = restore_defaults(db, company_id, body.template_code if body else None)
    return {
        "status": "success",
        **result,
        "message": (
            f"{result['created']} categoria(s) reposta(s)."
            if result["created"] else "O plano já estava completo — nada a repor."
        ),
    }
