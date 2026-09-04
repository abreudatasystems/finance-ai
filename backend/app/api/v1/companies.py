"""Companies and their teams.

A login can own several companies. Each one is a separate tenant: its own chart
of accounts, its own movements, its own team. Nothing here ever returns data
for a company the caller has no membership in.
"""

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import (
    ADMIN_ROLES, ROLE_LABELS, get_current_company_id, get_current_user,
    membership_for, require_admin,
)
from app.db.session import get_db
from app.models.models import Company, Transaction, User, UserMembership
from app.services import company_export, team as team_service

router = APIRouter()

VALID_REGIMES = {"normal", "isencao_art53"}
VALID_PERIODICITY = {"monthly", "quarterly"}


class CompanyCreate(BaseModel):
    name: str
    nif: Optional[str] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    legal_form: Optional[str] = None
    vat_regime: Optional[str] = None
    vat_periodicity: Optional[str] = None
    cae: Optional[str] = None


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


class RoleUpdate(BaseModel):
    role: str


def _access(db: Session, user: User, company_id: str) -> UserMembership:
    membership = membership_for(db, user.id, company_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Empresa não encontrada ou sem acesso")
    return membership


def _require_admin(membership: UserMembership) -> None:
    if membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Apenas proprietário ou administrador pode gerir a empresa e a equipa",
        )


def _serialize(company: Company, role: str, members: int = 0) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "nif": company.nif,
        "currency": company.currency,
        "fiscal_year_start": company.fiscal_year_start,
        "country": company.country,
        "legal_form": company.legal_form,
        "vat_regime": company.vat_regime,
        "vat_periodicity": company.vat_periodicity,
        "cae": company.cae,
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "role": role,
        "role_label": ROLE_LABELS.get(role, role),
        "member_count": members,
    }


@router.get("/")
@router.get("")
def get_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every company this login belongs to, with the role it holds in each."""
    memberships = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == current_user.id)
        .order_by(UserMembership.joined_at)
        .all()
    )
    if not memberships:
        return []

    ids = [m.company_id for m in memberships]
    companies = {c.id: c for c in db.query(Company).filter(Company.id.in_(ids)).all()}
    counts: dict[str, int] = {}
    for m in db.query(UserMembership).filter(UserMembership.company_id.in_(ids)).all():
        counts[m.company_id] = counts.get(m.company_id, 0) + 1

    return [
        _serialize(companies[m.company_id], m.role, counts.get(m.company_id, 0))
        for m in memberships
        if m.company_id in companies
    ]


@router.post("/", status_code=201)
@router.post("", status_code=201)
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open another company. Its data never mixes with the existing ones."""
    company = team_service.create_company(db, current_user, body.name, **body.model_dump(exclude={"name"}))
    return _serialize(company, "owner", 1)


@router.patch("/{company_id}")
def update_company(
    company_id: str,
    patch: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = _access(db, current_user, company_id)
    _require_admin(membership)

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
    return _serialize(company, membership.role)


# --------------------------------------------------------------------------
# Team
# --------------------------------------------------------------------------

@router.get("/{company_id}/members")
def list_members(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who is in this company, and how much each of them has been moving."""
    _access(db, current_user, company_id)

    memberships = (
        db.query(UserMembership)
        .filter(UserMembership.company_id == company_id)
        .order_by(UserMembership.joined_at)
        .all()
    )
    users = {
        u.id: u
        for u in db.query(User).filter(User.id.in_([m.user_id for m in memberships])).all()
    }

    # One pass over the movements, so a large team does not mean N queries.
    counts: dict[str, int] = {}
    for trx in db.query(Transaction).filter(Transaction.company_id == company_id).all():
        if trx.created_by:
            counts[trx.created_by] = counts.get(trx.created_by, 0) + 1

    out = []
    for m in memberships:
        user = users.get(m.user_id)
        if not user:
            continue
        out.append({
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "avatar": user.avatar,
            "account_type": user.account_type,
            "role": m.role,
            "role_label": ROLE_LABELS.get(m.role, m.role),
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "invited_by": m.invited_by,
            "is_you": user.id == current_user.id,
            "movimentos": counts.get(user.id, 0) + counts.get(user.name, 0),
        })
    return out


@router.patch("/{company_id}/members/{user_id}")
def update_member_role(
    company_id: str,
    user_id: str,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = _access(db, current_user, company_id)
    _require_admin(membership)
    updated = team_service.change_role(db, company_id, current_user, user_id, body.role)
    return {"user_id": user_id, "role": updated.role, "role_label": ROLE_LABELS.get(updated.role, updated.role)}


@router.delete("/{company_id}/members/{user_id}")
def remove_member(
    company_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = _access(db, current_user, company_id)
    # Anyone may leave on their own; removing someone else needs admin rights.
    if user_id != current_user.id:
        _require_admin(membership)
    team_service.remove_member(db, company_id, current_user, user_id)
    return {"status": "success", "removed_user_id": user_id}


@router.get("/{company_id}/members/{user_id}/activity")
def member_activity(
    company_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """What one member has moved in this company — the administration view."""
    membership = _access(db, current_user, company_id)
    if user_id != current_user.id:
        _require_admin(membership)
    return team_service.member_activity(db, company_id, user_id)


@router.get("/current")
def get_current_company(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
):
    """The company this request is scoped to — useful for the client to confirm."""
    company = db.query(Company).filter(Company.id == company_id).first()
    membership = membership_for(db, current_user.id, company_id)
    if not company or not membership:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return _serialize(company, membership.role)


# ---------------------------------------------------------------------------
# Taking the data away
# ---------------------------------------------------------------------------

@router.get("/export/summary")
def export_summary(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _admin: User = Depends(require_admin),
):
    """What an export would contain, so the size is never a surprise."""
    return company_export.summary(db, company_id)


@router.get("/export")
def export_company_data(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _admin: User = Depends(require_admin),
):
    """Every row that belongs to this company, as a ZIP of CSVs.

    Restricted to owners and administrators: it is the whole of the company's
    accounting in one file, and a viewer has no business walking out with it.
    """
    payload, manifest = company_export.build(db, company_id, current_user.name)
    company = db.query(Company).filter(Company.id == company_id).first()
    name = company_export.filename_for(company)
    return Response(
        content=payload,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            # So a client can show what it got without opening the archive.
            "X-Export-Records": str(manifest["total_registos"]),
            "X-Export-Tables": str(len(manifest["tabelas"])),
        },
    )


# ---------------------------------------------------------------------------
# Segredo de ingestão automática
# ---------------------------------------------------------------------------

@router.get("/ingest-token")
def get_ingest_token(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _admin: User = Depends(require_admin),
):
    """O segredo que identifica esta empresa nos canais automáticos.

    Quem manda uma fatura por email não está autenticado como pessoa; é este
    segredo que diz de que empresa se trata. Só proprietário ou administrador
    o vê — quem o tiver escreve na fila de aprovações da empresa.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return {
        "token": company.ingest_token,
        "ativo": bool(company.ingest_token),
        "cabecalho": "X-Ingest-Token",
        "canais": ["/api/v1/webhooks/email", "/api/v1/webhooks/whatsapp"],
    }


@router.post("/ingest-token", status_code=201)
def rotate_ingest_token(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _admin: User = Depends(require_admin),
):
    """Gera um segredo novo, e invalida o anterior no mesmo instante.

    Serve para as duas coisas: ligar o canal pela primeira vez e cortá-lo a
    quem já não devia ter acesso. Não há aqui um "revogar" à parte porque
    rodar é revogar — o token antigo deixa de resolver para empresa nenhuma.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    company.ingest_token = secrets.token_urlsafe(32)
    db.commit()
    return {"token": company.ingest_token, "ativo": True, "cabecalho": "X-Ingest-Token"}


@router.delete("/ingest-token", status_code=204)
def disable_ingest_token(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _admin: User = Depends(require_admin),
):
    """Desliga a ingestão automática. Os documentos já recebidos ficam."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    company.ingest_token = None
    db.commit()
    return Response(status_code=204)
