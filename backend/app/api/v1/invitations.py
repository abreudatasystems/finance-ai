"""Invitations — how someone else gets into a company.

Flow:

1. An owner or admin creates an invitation for an email address and a role.
   The response carries the link to send (there is no mail server here yet, so
   the link is handed to the inviter to pass along).
2. The invited person opens the link. ``GET /invitations/token/{token}``
   answers publicly with just enough to show the invitation: company, role,
   who invited them, and whether that email already has a login.
3. They either **accept** with an existing login, or **register from the
   invitation** — which creates an ``invited`` account: full access to the
   company it was invited to, no ability to open companies of its own.

The email in step 1 is sent when SMTP is configured; when it is not, the link
comes back in the response to be copied by hand. The invitation is valid
either way — a mail server that is down must not stop someone joining.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import ROLE_LABELS, get_current_user, membership_for
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.services import mailer
from app.db.session import get_db
from app.models.models import Company, Invitation, User
from app.services import team as team_service

router = APIRouter()


class InvitationCreate(BaseModel):
    email: str
    role: str = "viewer"
    message: Optional[str] = None


class AcceptRequest(BaseModel):
    token: str


class RegisterFromInvite(BaseModel):
    token: str
    name: str
    password: str


def _serialize(inv: Invitation, db: Session, include_token: bool = False) -> dict:
    inviter = db.query(User).filter(User.id == inv.invited_by).first() if inv.invited_by else None
    data = {
        "id": inv.id,
        "company_id": inv.company_id,
        "email": inv.email,
        "role": inv.role,
        "role_label": ROLE_LABELS.get(inv.role, inv.role),
        "status": inv.status,
        "message": inv.message,
        "invited_by_name": inviter.name if inviter else None,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        "accepted_at": inv.accepted_at.isoformat() if inv.accepted_at else None,
    }
    if include_token:
        data["token"] = inv.token
        data["accept_path"] = f"/invite/{inv.token}"
        data["accept_url"] = _invite_link(inv.token)
    return data


def _invite_link(token: str) -> str:
    """The address the invited person opens — the app's, not the API's."""
    base = (settings.APP_BASE_URL or "").rstrip("/")
    return f"{base}/invite/{token}"


def _deliver(db: Session, invitation: Invitation, inviter: User) -> dict:
    """Send the invitation email, and report honestly whether it went."""
    company = db.query(Company).filter(Company.id == invitation.company_id).first()
    subject, text, html = mailer.invitation_message(
        company_name=company.name if company else "a empresa",
        role_label=ROLE_LABELS.get(invitation.role, invitation.role),
        inviter=inviter.name,
        link=_invite_link(invitation.token),
        note=invitation.message,
    )
    return mailer.send(invitation.email, subject, text, html).as_dict()


def _admin_access(db: Session, user: User, company_id: str):
    membership = membership_for(db, user.id, company_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Empresa não encontrada ou sem acesso")
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Apenas proprietário ou administrador pode convidar")
    return membership


@router.get("/company/{company_id}")
def list_invitations(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin_access(db, current_user, company_id)
    rows = (
        db.query(Invitation)
        .filter(Invitation.company_id == company_id)
        .order_by(Invitation.created_at.desc())
        .all()
    )
    return [_serialize(i, db, include_token=(i.status == "pending")) for i in rows]


@router.post("/company/{company_id}", status_code=201)
def create_invitation(
    company_id: str,
    body: InvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _admin_access(db, current_user, company_id)
    invitation = team_service.create_invitation(
        db, company_id, current_user, body.email, body.role, body.message,
    )
    return {**_serialize(invitation, db, include_token=True),
            "email_result": _deliver(db, invitation, current_user)}


@router.post("/{invitation_id}/resend")
def resend_invitation(
    invitation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send the same invitation again — useful when the first email was missed."""
    invitation = db.query(Invitation).filter(Invitation.id == invitation_id).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    _admin_access(db, current_user, invitation.company_id)

    if invitation.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Este convite já foi {'aceite' if invitation.status == 'accepted' else 'cancelado'}.",
        )
    return {**_serialize(invitation, db, include_token=True),
            "email_result": _deliver(db, invitation, current_user)}


@router.delete("/{invitation_id}")
def revoke_invitation(
    invitation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invitation = db.query(Invitation).filter(Invitation.id == invitation_id).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    _admin_access(db, current_user, invitation.company_id)

    if invitation.status == "accepted":
        raise HTTPException(status_code=409, detail="Este convite já foi aceite. Remova a pessoa na lista de membros.")

    invitation.status = "revoked"
    team_service.audit(db, invitation.company_id, current_user.name, "cancelar",
                       f"Cancelou o convite de {invitation.email}", invitation.id)
    db.commit()
    return {"status": "success", "invitation_id": invitation_id}


@router.get("/token/{token}")
def preview_invitation(token: str, db: Session = Depends(get_db)):
    """Public: what the invited person sees before deciding."""
    invitation = team_service.load_open_invitation(db, token)
    company = db.query(Company).filter(Company.id == invitation.company_id).first()
    inviter = db.query(User).filter(User.id == invitation.invited_by).first() if invitation.invited_by else None
    existing = db.query(User).filter(User.email == invitation.email).first()
    return {
        "company_name": company.name if company else "—",
        "email": invitation.email,
        "role": invitation.role,
        "role_label": ROLE_LABELS.get(invitation.role, invitation.role),
        "invited_by_name": inviter.name if inviter else None,
        "message": invitation.message,
        "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
        # Tells the client which of the two doors to show, without leaking more.
        "account_exists": bool(existing),
    }


@router.post("/accept")
def accept_invitation(
    body: AcceptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept with the login you are already signed in as."""
    invitation = team_service.load_open_invitation(db, body.token)
    membership = team_service.accept_invitation(db, invitation, current_user)
    company = db.query(Company).filter(Company.id == membership.company_id).first()
    return {
        "status": "success",
        "company_id": membership.company_id,
        "company_name": company.name if company else None,
        "role": membership.role,
    }


@router.post("/register", status_code=201)
def register_from_invitation(
    body: RegisterFromInvite,
    db: Session = Depends(get_db),
):
    """Create the account the invitation is addressed to and join in one step.

    The resulting account is an ``invited`` one: it lives inside the companies
    it is invited to and cannot open companies of its own.
    """
    invitation = team_service.load_open_invitation(db, body.token)

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="A palavra-passe deve ter pelo menos 8 caracteres")
    if db.query(User).filter(User.email == invitation.email).first():
        raise HTTPException(
            status_code=409,
            detail="Já existe uma conta com este email. Entre com ela para aceitar o convite.",
        )

    user = User(
        id=team_service._uid("USR"),
        name=body.name.strip() or invitation.email.split("@")[0],
        email=invitation.email,
        hashed_password=get_password_hash(body.password),
        account_type="invited",
    )
    db.add(user)
    db.commit()

    team_service.accept_invitation(db, invitation, user)
    return {
        "access_token": create_access_token(subject=user.id),
        "token_type": "bearer",
        "company_id": invitation.company_id,
    }


@router.get("/mine")
def my_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invitations waiting for the signed-in user's email address."""
    rows = (
        db.query(Invitation)
        .filter(Invitation.email == current_user.email.lower(), Invitation.status == "pending")
        .all()
    )
    out = []
    for inv in rows:
        company = db.query(Company).filter(Company.id == inv.company_id).first()
        item = _serialize(inv, db, include_token=True)
        item["company_name"] = company.name if company else None
        out.append(item)
    return out
