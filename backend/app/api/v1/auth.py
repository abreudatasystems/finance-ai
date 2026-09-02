from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.models import User, Company, UserMembership
from pydantic import BaseModel

from app.schemas.schemas import LoginRequest, UserCreate, Token
from app.core import login_guard, passwords
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.models import AuditLog
from app.services.provisioning import apply_template

router = APIRouter()


def _memberships(db: Session, user_id: str) -> list[dict]:
    """Every company this login belongs to, newest role information included."""
    rows = (
        db.query(UserMembership)
        .filter(UserMembership.user_id == user_id)
        .order_by(UserMembership.joined_at)
        .all()
    )
    if not rows:
        return []
    names = {
        c.id: c.name
        for c in db.query(Company).filter(Company.id.in_([m.company_id for m in rows])).all()
    }
    return [
        {
            "company_id": m.company_id,
            "company_name": names.get(m.company_id),
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in rows
    ]


def _audit(db: Session, company_id: Optional[str], user: str, action: str, description: str) -> None:
    """Authentication events belong in the trail like everything else."""
    if not company_id:
        return
    now = datetime.now(timezone.utc)
    db.add(AuditLog(
        id=f"AUD-{int(now.timestamp() * 1000000)}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=user,
        action=action,
        module="Autenticação",
        description=description,
    ))
    db.commit()


def _first_company(db: Session, user_id: str) -> Optional[str]:
    membership = db.query(UserMembership).filter(UserMembership.user_id == user_id).first()
    return membership.company_id if membership else None


@router.post("/login", response_model=Token)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # Guessing a password should cost time. The wait is stated, because a
    # lockout with no end is indistinguishable from a broken product.
    locked = login_guard.seconds_locked(request.email)
    if locked:
        minutes = max(1, round(locked / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Demasiadas tentativas falhadas. Tente de novo dentro de "
                f"{minutes} minuto(s)."
            ),
        )

    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        remaining = login_guard.register_failure(request.email)
        if user:
            _audit(db, _first_company(db, user.id), user.name, "login_falhado",
                   "Tentativa de início de sessão com palavra-passe errada")
        detail = "Email ou palavra-passe incorretos"
        if 0 < remaining <= 2:
            detail += f". Restam {remaining} tentativa(s) antes de bloquear temporariamente."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    login_guard.register_success(request.email)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token(subject=user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(request: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já registado")

    try:
        passwords.validate(request.password, email=request.email, name=request.name)
    except passwords.PasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    user_id = f"USR-{stamp}"
    comp_id = f"COMP-{stamp}"

    new_comp = Company(id=comp_id, name=request.company_name, nif="PT500000000")
    new_user = User(
        id=user_id,
        name=request.name,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        account_type="full",       # registered on their own: may open companies
    )
    new_mem = UserMembership(id=f"MEM-{user_id}", user_id=user_id, company_id=comp_id, role="owner")

    db.add(new_comp)
    db.add(new_user)
    db.add(new_mem)
    db.commit()

    # Give the new company a working chart of accounts straight away.
    apply_template(db, comp_id)

    token = create_access_token(subject=user_id)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = _memberships(db, current_user.id)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "avatar": current_user.avatar,
        # "full" logins may open more companies; "invited" ones only participate.
        "account_type": current_user.account_type or "full",
        "can_create_companies": (current_user.account_type or "full") != "invited",
        "memberships": memberships,
        # Kept for older clients that read a single role.
        "role": memberships[0]["role"] if memberships else "viewer",
    }


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change your own password, proving you know the current one.

    Requiring the current password is what stops a borrowed session from
    becoming a permanent one.
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=403, detail="A palavra-passe atual não está correta")

    try:
        passwords.validate(body.new_password, email=current_user.email, name=current_user.name)
    except passwords.PasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if verify_password(body.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="A nova palavra-passe é igual à atual")

    current_user.hashed_password = get_password_hash(body.new_password)
    db.commit()

    _audit(db, _first_company(db, current_user.id), current_user.name,
           "alterar", "Alterou a palavra-passe")
    return {"status": "success", "message": "Palavra-passe alterada."}
