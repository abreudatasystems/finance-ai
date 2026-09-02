"""Team and tenancy service.

Everything that decides *who* may be in a company and *what* they may do lives
here, so the API routers stay thin and the rules cannot drift apart between
endpoints:

* creating a company (a login may own several, each fully separate);
* inviting people, accepting an invitation, and the account that is born from
  one (``account_type="invited"`` — works inside the companies it was invited
  to, cannot open companies of its own);
* changing a member's role and removing a member, with the guard that a company
  can never be left without an owner.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import ROLE_ORDER, ROLE_OWNER, VALID_ROLES, ROLE_LABELS
from app.models.models import (
    PLACEHOLDER_NIF, AuditLog, Company, Invitation, Transaction, User, UserMembership,
)
from app.services.provisioning import apply_template

INVITATION_TTL_DAYS = 14

#: Roles that may be handed out through an invitation. Ownership is not one of
#: them — it is transferred deliberately, from the members screen.
INVITABLE_ROLES = ("admin", "finance_manager", "viewer")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stamp() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _uid(prefix: str) -> str:
    return f"{prefix}-{_stamp()}-{secrets.token_hex(2).upper()}"


def audit(db: Session, company_id: str, user: str, action: str, description: str,
          entity_id: Optional[str] = None, module: str = "equipa") -> None:
    db.add(AuditLog(
        id=_uid("LOG"),
        company_id=company_id,
        timestamp=_now().isoformat(),
        user=user,
        action=action,
        module=module,
        description=description,
        entity_id=entity_id,
    ))


# --------------------------------------------------------------------------
# Companies
# --------------------------------------------------------------------------

def create_company(db: Session, user: User, name: str, **profile) -> Company:
    """Open another company for a login. The creator becomes its owner."""
    if user.account_type == "invited":
        raise HTTPException(
            status_code=403,
            detail=(
                "Esta conta foi criada por convite e só participa nas empresas "
                "para onde foi convidada. Crie uma conta própria para abrir empresas."
            ),
        )

    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome da empresa é obrigatório")

    duplicate = (
        db.query(Company)
        .join(UserMembership, UserMembership.company_id == Company.id)
        .filter(UserMembership.user_id == user.id)
        .filter(Company.name.ilike(name))
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail=f"Já tem uma empresa chamada '{name}'")

    company = Company(
        id=_uid("COMP"),
        name=name,
        nif=profile.get("nif") or PLACEHOLDER_NIF,
        currency=profile.get("currency") or "EUR",
        country=profile.get("country") or "PT",
        legal_form=profile.get("legal_form"),
        vat_regime=profile.get("vat_regime") or "normal",
        vat_periodicity=profile.get("vat_periodicity") or "quarterly",
        cae=profile.get("cae"),
    )
    db.add(company)
    db.add(UserMembership(
        id=_uid("MEM"),
        user_id=user.id,
        company_id=company.id,
        role=ROLE_OWNER,
    ))
    db.commit()

    # A new tenant starts with a working chart of accounts, like the first one.
    apply_template(db, company.id)

    audit(db, company.id, user.name, "criar", f"Criou a empresa '{company.name}'", company.id, "empresa")
    db.commit()
    db.refresh(company)
    return company


# --------------------------------------------------------------------------
# Members
# --------------------------------------------------------------------------

def owners_of(db: Session, company_id: str) -> list[UserMembership]:
    return (
        db.query(UserMembership)
        .filter(UserMembership.company_id == company_id, UserMembership.role == ROLE_OWNER)
        .all()
    )


def _guard_last_owner(db: Session, company_id: str, membership: UserMembership) -> None:
    if membership.role != ROLE_OWNER:
        return
    if len(owners_of(db, company_id)) <= 1:
        raise HTTPException(
            status_code=409,
            detail="A empresa tem de ter sempre pelo menos um proprietário. Promova outra pessoa primeiro.",
        )


def change_role(db: Session, company_id: str, actor: User, target_user_id: str, role: str) -> UserMembership:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Papel inválido")

    actor_membership = _membership(db, actor.id, company_id)
    target = _membership(db, target_user_id, company_id)

    # Only an owner hands out ownership, and only an owner demotes an owner.
    if (role == ROLE_OWNER or target.role == ROLE_OWNER) and actor_membership.role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Apenas um proprietário pode alterar a propriedade da empresa")

    if target.role != role:
        _guard_last_owner(db, company_id, target)

    before = target.role
    target.role = role
    target_user = db.query(User).filter(User.id == target_user_id).first()
    audit(db, company_id, actor.name, "alterar",
          f"Alterou o papel de {target_user.name if target_user else target_user_id}: "
          f"{ROLE_LABELS.get(before, before)} → {ROLE_LABELS.get(role, role)}", target_user_id)
    db.commit()
    db.refresh(target)
    return target


def remove_member(db: Session, company_id: str, actor: User, target_user_id: str) -> None:
    target = _membership(db, target_user_id, company_id)
    _guard_last_owner(db, company_id, target)

    target_user = db.query(User).filter(User.id == target_user_id).first()
    db.delete(target)
    audit(db, company_id, actor.name, "remover",
          f"Removeu {target_user.name if target_user else target_user_id} da equipa", target_user_id)
    db.commit()


def _membership(db: Session, user_id: str, company_id: str) -> UserMembership:
    membership = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == user_id, UserMembership.company_id == company_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Membro não encontrado nesta empresa")
    return membership


def member_activity(db: Session, company_id: str, user_id: str) -> dict:
    """What this member has been moving inside this company."""
    user = db.query(User).filter(User.id == user_id).first()
    name = user.name if user else user_id

    rows = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id, Transaction.created_by.in_([user_id, name]))
        .order_by(Transaction.created_at.desc())
        .all()
    )
    entradas = sum(float(t.amount or 0) for t in rows if t.type == "income")
    saidas = sum(float(t.amount or 0) for t in rows if t.type == "expense")

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.company_id == company_id, AuditLog.user == name)
        .order_by(AuditLog.timestamp.desc())
        .limit(20)
        .all()
    )
    return {
        "user_id": user_id,
        "name": name,
        "lancamentos": len(rows),
        "total_entradas": round(entradas, 2),
        "total_saidas": round(saidas, 2),
        "ultimo_lancamento": rows[0].created_at.isoformat() if rows and rows[0].created_at else None,
        "movimentos": [
            {
                "id": t.id,
                "date": t.date,
                "description": t.description,
                "type": t.type,
                "amount": float(t.amount or 0),
                "status": t.status,
            }
            for t in rows[:20]
        ],
        "acoes": [
            {"timestamp": l.timestamp, "action": l.action, "module": l.module, "description": l.description}
            for l in logs
        ],
    }


# --------------------------------------------------------------------------
# Invitations
# --------------------------------------------------------------------------

def create_invitation(db: Session, company_id: str, actor: User, email: str,
                      role: str, message: Optional[str] = None) -> Invitation:
    email = (email or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    if role not in INVITABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Papel inválido para convite. A propriedade transfere-se na lista de membros.",
        )

    already = (
        db.query(UserMembership)
        .join(User, User.id == UserMembership.user_id)
        .filter(UserMembership.company_id == company_id, User.email == email)
        .first()
    )
    if already:
        raise HTTPException(status_code=409, detail="Esta pessoa já faz parte da equipa")

    pending = (
        db.query(Invitation)
        .filter(Invitation.company_id == company_id, Invitation.email == email,
                Invitation.status == "pending")
        .first()
    )
    if pending:
        # Re-issuing is friendlier than an error: refresh the token and clock.
        pending.token = secrets.token_urlsafe(32)
        pending.role = role
        pending.message = message
        pending.expires_at = _now() + timedelta(days=INVITATION_TTL_DAYS)
        pending.invited_by = actor.id
        db.commit()
        db.refresh(pending)
        return pending

    invitation = Invitation(
        id=_uid("INV"),
        company_id=company_id,
        email=email,
        role=role,
        token=secrets.token_urlsafe(32),
        status="pending",
        message=message,
        invited_by=actor.id,
        expires_at=_now() + timedelta(days=INVITATION_TTL_DAYS),
    )
    db.add(invitation)
    audit(db, company_id, actor.name, "convidar",
          f"Convidou {email} como {ROLE_LABELS.get(role, role)}", invitation.id)
    db.commit()
    db.refresh(invitation)
    return invitation


def load_open_invitation(db: Session, token: str) -> Invitation:
    invitation = db.query(Invitation).filter(Invitation.token == token).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    if invitation.status == "accepted":
        raise HTTPException(status_code=409, detail="Este convite já foi aceite")
    if invitation.status == "revoked":
        raise HTTPException(status_code=409, detail="Este convite foi cancelado")
    if invitation.expires_at and invitation.expires_at < _now():
        raise HTTPException(status_code=409, detail="Este convite expirou. Peça um novo.")
    return invitation


def accept_invitation(db: Session, invitation: Invitation, user: User) -> UserMembership:
    """Attach an existing login to the inviting company."""
    if user.email.lower() != invitation.email.lower():
        raise HTTPException(
            status_code=403,
            detail=f"Este convite foi enviado para {invitation.email}. Entre com essa conta para o aceitar.",
        )

    membership = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == user.id, UserMembership.company_id == invitation.company_id)
        .first()
    )
    if not membership:
        membership = UserMembership(
            id=_uid("MEM"),
            user_id=user.id,
            company_id=invitation.company_id,
            role=invitation.role,
            invited_by=invitation.invited_by,
        )
        db.add(membership)

    invitation.status = "accepted"
    invitation.accepted_at = _now()
    invitation.accepted_by = user.id
    audit(db, invitation.company_id, user.name, "aceitar",
          f"{user.name} aceitou o convite e entrou como {ROLE_LABELS.get(invitation.role, invitation.role)}",
          invitation.id)
    db.commit()
    db.refresh(membership)
    return membership


def role_rank(role: str) -> int:
    try:
        return ROLE_ORDER.index(role)
    except ValueError:
        return len(ROLE_ORDER)
