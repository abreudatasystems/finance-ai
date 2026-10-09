import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import ADMIN_ROLES, get_current_membership, get_current_user
from app.models.models import (
    PLACEHOLDER_NIF, User, Company, UserMembership, PasswordResetToken, TwoFactorRecoveryCode,
)
from pydantic import BaseModel

from app.schemas.schemas import LoginRequest, UserCreate, Token
from app.core import login_guard, passwords, two_factor
from app.core.clock import utcnow
from app.core.config import settings
from app.core.security import (
    verify_password, get_password_hash, create_access_token, hash_token,
    create_two_factor_challenge, decode_two_factor_challenge, password_fingerprint,
)
from app.models.models import AuditLog
from app.services import mailer
from app.services.provisioning import apply_template

router = APIRouter()
logger = logging.getLogger(__name__)

#: Validade do link de recuperação de palavra-passe.
RESET_TOKEN_MINUTES = 60
#: Pedidos de recuperação por endereço antes de bloquear temporariamente.
MAX_RESET_REQUESTS_PER_IP = 10
#: Emails de recuperação para a mesma conta dentro da janela do login_guard.
MAX_RESET_EMAILS_PER_ACCOUNT = 3
#: Links inválidos tentados por endereço antes de bloquear.
MAX_RESET_FAILURES_PER_IP = 10

FORGOT_MESSAGE = (
    "Se existir uma conta com esse email, enviámos um link para definir uma nova "
    "palavra-passe. O link expira dentro de 1 hora."
)


class TwoFactorChallenge(BaseModel):
    two_factor_required: bool = True
    challenge_token: str


def _client_ip(http: Request) -> str:
    return login_guard.ip_key(http.client.host if http.client else None)


def _too_many(seconds: int) -> HTTPException:
    minutes = max(1, round(seconds / 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Demasiadas tentativas falhadas. Tente de novo dentro de {minutes} minuto(s).",
    )


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


@router.post("/login", response_model=Union[Token, TwoFactorChallenge])
def login(request: LoginRequest, http: Request, db: Session = Depends(get_db)):
    # Guessing a password should cost time. The wait is stated, because a
    # lockout with no end is indistinguishable from a broken product.
    email = request.email.strip().lower()
    address = _client_ip(http)
    locked = max(login_guard.seconds_locked(email), login_guard.seconds_locked(address))
    if locked:
        raise _too_many(locked)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        remaining = login_guard.register_failure(email)
        login_guard.register_failure(address, max_attempts=login_guard.MAX_ATTEMPTS_PER_IP)
        if user:
            _audit(db, _first_company(db, user.id), user.name, "login_falhado",
                   "Tentativa de início de sessão com palavra-passe errada")
        detail = "Email ou palavra-passe incorretos"
        if 0 < remaining <= 2:
            detail += f". Restam {remaining} tentativa(s) antes de bloquear temporariamente."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    if user.two_factor_enabled:
        # A palavra-passe certa ainda não limpa o contador desta conta: só o
        # código o faz. Caso contrário, quem soubesse a palavra-passe podia
        # tentar códigos sem fim, repondo o contador a cada volta.
        return {
            "two_factor_required": True,
            "challenge_token": create_two_factor_challenge(user.id, user.hashed_password),
        }

    login_guard.register_success(email)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token(subject=user.id, password_hash=user.hashed_password)
    return {"access_token": token, "token_type": "bearer"}


# --------------------------------------------------------------------------
# Verificação em dois passos — segundo passo do login
# --------------------------------------------------------------------------

class TwoFactorLogin(BaseModel):
    challenge_token: str
    code: str


def _use_recovery_code(db: Session, user: User, code: str) -> bool:
    """Gasta um código de recuperação, se for válido e ainda não usado."""
    if not two_factor.looks_like_recovery_code(code):
        return False
    row = (
        db.query(TwoFactorRecoveryCode)
        .filter(
            TwoFactorRecoveryCode.user_id == user.id,
            TwoFactorRecoveryCode.code_hash == two_factor.hash_recovery_code(code),
            TwoFactorRecoveryCode.used_at.is_(None),
        )
        .first()
    )
    if not row:
        return False
    row.used_at = utcnow()
    return True


def _check_second_factor(db: Session, user: User, code: str) -> Optional[str]:
    """'totp' ou 'recovery' consoante o que serviu; None se nada serviu."""
    step = two_factor.matching_step(user.totp_secret, code, user.totp_last_step)
    if step is not None:
        user.totp_last_step = step
        return "totp"
    if _use_recovery_code(db, user, code):
        return "recovery"
    return None


def _register_code_failure(db: Session, user: User, address: str, what: str) -> HTTPException:
    db.rollback()
    remaining = login_guard.register_failure((user.email or "").strip().lower())
    login_guard.register_failure(address, max_attempts=login_guard.MAX_ATTEMPTS_PER_IP)
    _audit(db, _first_company(db, user.id), user.name, "login_falhado", what)
    detail = "Código inválido."
    if 0 < remaining <= 2:
        detail += f" Restam {remaining} tentativa(s) antes de bloquear temporariamente."
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


@router.post("/login/2fa", response_model=Token)
def login_two_factor(body: TwoFactorLogin, http: Request, db: Session = Depends(get_db)):
    """Segundo passo do início de sessão: o código da app ou um de recuperação."""
    expired = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="O pedido de início de sessão expirou. Introduza de novo a palavra-passe.",
    )
    claims = decode_two_factor_challenge(body.challenge_token)
    if not claims:
        raise expired
    user = db.query(User).filter(User.id == claims["sub"]).first()
    if (not user or not user.two_factor_enabled or user.active is False
            or claims.get("pwd") != password_fingerprint(user.hashed_password)):
        raise expired

    email = (user.email or "").strip().lower()
    address = _client_ip(http)
    locked = max(login_guard.seconds_locked(email), login_guard.seconds_locked(address))
    if locked:
        raise _too_many(locked)

    used = _check_second_factor(db, user, body.code)
    if not used:
        raise _register_code_failure(db, user, address,
                                     "Código de verificação em dois passos errado")

    login_guard.register_success(email)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    if used == "recovery":
        _audit(db, _first_company(db, user.id), user.name, "login",
               "Entrou com um código de recuperação da verificação em dois passos")

    token = create_access_token(subject=user.id, password_hash=user.hashed_password)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(request: UserCreate, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já registado")

    try:
        passwords.validate(request.password, email=request.email, name=request.name)
    except passwords.PasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    user_id = f"USR-{stamp}"
    comp_id = f"COMP-{stamp}"

    new_comp = Company(id=comp_id, name=request.company_name, nif=PLACEHOLDER_NIF)
    new_user = User(
        id=user_id,
        name=request.name,
        email=email,
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

    token = create_access_token(subject=user_id, password_hash=new_user.hashed_password)
    return {"access_token": token, "token_type": "bearer"}


def _policy_requires(db: Session, user_id: str) -> bool:
    """Alguma das empresas desta conta obriga a usar 2FA?"""
    return (
        db.query(Company.id)
        .join(UserMembership, UserMembership.company_id == Company.id)
        .filter(UserMembership.user_id == user_id, Company.require_two_factor.is_(True))
        .first()
        is not None
    )


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
        "two_factor_enabled": bool(current_user.two_factor_enabled),
        # Uma empresa desta conta obriga a 2FA e ela ainda não está ativa: o
        # frontend leva a pessoa à configuração antes de deixar usar a app.
        "two_factor_setup_required": (
            not current_user.two_factor_enabled and _policy_requires(db, current_user.id)
        ),
        # Kept for older clients that read a single role.
        "role": memberships[0]["role"] if memberships else "viewer",
    }


def _set_password(db: Session, user: User, new_password: str) -> None:
    """Grava a nova palavra-passe.

    O token de sessão leva uma impressão do hash, por isso mudar o hash termina
    todas as sessões abertas com a palavra-passe antiga. Links de recuperação
    ainda por usar deixam de valer.
    """
    user.hashed_password = get_password_hash(new_password)
    now = utcnow()
    for pending in (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .all()
    ):
        pending.used_at = now
    db.commit()


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

    _set_password(db, current_user, body.new_password)

    _audit(db, _first_company(db, current_user.id), current_user.name,
           "alterar", "Alterou a palavra-passe")
    # As outras sessões caem com a palavra-passe antiga; esta continua, com
    # um token novo.
    return {
        "status": "success",
        "message": "Palavra-passe alterada. As outras sessões foram terminadas.",
        "access_token": create_access_token(subject=current_user.id,
                                            password_hash=current_user.hashed_password),
    }


# --------------------------------------------------------------------------
# Recuperação de palavra-passe por email
# --------------------------------------------------------------------------

class ForgotPassword(BaseModel):
    email: str


class ResetPassword(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
def forgot_password(body: ForgotPassword, http: Request, db: Session = Depends(get_db)):
    """Envia um link para definir nova palavra-passe.

    A resposta é sempre a mesma, exista ou não a conta — de outro modo este
    formulário servia para descobrir quem tem conta. O link nunca vem na
    resposta: só por email.
    """
    address = "reset-pedido:" + _client_ip(http)
    locked = login_guard.seconds_locked(address)
    if locked:
        raise _too_many(locked)
    login_guard.register_failure(address, max_attempts=MAX_RESET_REQUESTS_PER_IP)

    email = (body.email or "").strip().lower()
    response = {"status": "success", "message": FORGOT_MESSAGE}
    if not email:
        return response

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or user.active is False:
        return response

    # Limite por conta, em silêncio: ninguém consegue encher a caixa de outra
    # pessoa, e a resposta continua igual.
    account_key = "reset-email:" + email
    if login_guard.seconds_locked(account_key):
        return response
    login_guard.register_failure(account_key, max_attempts=MAX_RESET_EMAILS_PER_ACCOUNT)

    now = utcnow()
    for pending in (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .all()
    ):
        pending.used_at = now

    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        id=f"PRT-{secrets.token_hex(8)}",
        user_id=user.id,
        token_hash=hash_token(token),
        created_at=now,
        expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
        requested_ip=http.client.host if http.client else None,
    ))
    db.commit()

    link = f"{settings.APP_BASE_URL.rstrip('/')}/reset-password/{token}"
    if not mailer.is_configured():
        logger.warning(
            "Pedido de recuperação de palavra-passe para %s, mas o envio de email "
            "não está configurado (SMTP_HOST) — o email não foi enviado.", user.id,
        )
    else:
        subject, text, html = mailer.password_reset_message(user.name, link, RESET_TOKEN_MINUTES)
        result = mailer.send(user.email, subject, text, html)
        if not result.sent:
            logger.warning("Email de recuperação para %s não foi enviado: %s",
                           user.id, result.reason)

    _audit(db, _first_company(db, user.id), user.name, "recuperar_palavra_passe",
           "Pediu um link para definir nova palavra-passe")
    return response


@router.post("/reset-password")
def reset_password(body: ResetPassword, http: Request, db: Session = Depends(get_db)):
    """Define a nova palavra-passe a partir do link enviado por email."""
    address = "reset-falha:" + _client_ip(http)
    locked = login_guard.seconds_locked(address)
    if locked:
        raise _too_many(locked)

    now = utcnow()
    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == hash_token(body.token or ""))
        .first()
    )
    user = db.query(User).filter(User.id == row.user_id).first() if row else None
    if (not row or row.used_at is not None or row.expires_at < now
            or not user or user.active is False):
        login_guard.register_failure(address, max_attempts=MAX_RESET_FAILURES_PER_IP)
        raise HTTPException(
            status_code=400,
            detail="O link de recuperação é inválido ou já expirou. Peça um novo.",
        )

    try:
        passwords.validate(body.new_password, email=user.email, name=user.name)
    except passwords.PasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Marca este e quaisquer outros pedidos pendentes como usados.
    _set_password(db, user, body.new_password)
    # Quem provou ser dono do email deixa de estar bloqueado no login.
    login_guard.register_success((user.email or "").strip().lower())

    _audit(db, _first_company(db, user.id), user.name, "alterar",
           "Definiu nova palavra-passe através do link de recuperação")
    return {
        "status": "success",
        "message": "Palavra-passe alterada. Já pode iniciar sessão com a nova palavra-passe.",
    }


# --------------------------------------------------------------------------
# Verificação em dois passos — configuração
# --------------------------------------------------------------------------

class TwoFactorCode(BaseModel):
    code: str


class TwoFactorDisable(BaseModel):
    password: str
    code: str


class TwoFactorPolicy(BaseModel):
    require_two_factor: bool


def _remaining_recovery_codes(db: Session, user_id: str) -> int:
    return (
        db.query(TwoFactorRecoveryCode)
        .filter(TwoFactorRecoveryCode.user_id == user_id, TwoFactorRecoveryCode.used_at.is_(None))
        .count()
    )


@router.get("/2fa/status")
def two_factor_status(
    current_user: User = Depends(get_current_user),
    membership: UserMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Estado da 2FA desta conta e a política da empresa ativa."""
    company = db.query(Company).filter(Company.id == membership.company_id).first()
    return {
        "enabled": bool(current_user.two_factor_enabled),
        "enabled_at": (current_user.two_factor_enabled_at.isoformat()
                       if current_user.two_factor_enabled_at else None),
        "recovery_codes_remaining": (_remaining_recovery_codes(db, current_user.id)
                                     if current_user.two_factor_enabled else 0),
        "setup_required": (not current_user.two_factor_enabled
                           and _policy_requires(db, current_user.id)),
        "company_id": membership.company_id,
        "company_requires": bool(company.require_two_factor) if company else False,
        "can_manage_policy": membership.role in ADMIN_ROLES,
    }


@router.post("/2fa/setup")
def two_factor_setup(current_user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Gera um segredo novo, à espera de ser confirmado em /2fa/enable."""
    if current_user.two_factor_enabled:
        raise HTTPException(status_code=400,
                            detail="A verificação em dois passos já está ativa.")
    secret = two_factor.new_secret()
    current_user.totp_pending_secret = secret
    db.commit()
    uri = two_factor.provisioning_uri(secret, current_user.email)
    return {
        "secret": secret,
        "otpauth_uri": uri,
        "qr_svg": two_factor.qr_svg_data_uri(uri),
    }


@router.post("/2fa/enable")
def two_factor_enable(body: TwoFactorCode,
                      current_user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """Confirma o código da app e ativa a 2FA. Os códigos de recuperação só se
    mostram nesta resposta."""
    if current_user.two_factor_enabled:
        raise HTTPException(status_code=400,
                            detail="A verificação em dois passos já está ativa.")
    secret = current_user.totp_pending_secret
    if not secret:
        raise HTTPException(status_code=400,
                            detail="Comece a configuração primeiro (o QR expirou ou não foi gerado).")
    step = two_factor.matching_step(secret, body.code)
    if step is None:
        raise HTTPException(status_code=400,
                            detail="Código inválido. Confirme a hora do telemóvel e tente de novo.")

    current_user.totp_secret = secret
    current_user.totp_pending_secret = None
    current_user.totp_last_step = step
    current_user.two_factor_enabled = True
    current_user.two_factor_enabled_at = utcnow()

    db.query(TwoFactorRecoveryCode).filter(
        TwoFactorRecoveryCode.user_id == current_user.id).delete()
    codes = two_factor.new_recovery_codes()
    for code in codes:
        db.add(TwoFactorRecoveryCode(
            id=f"RC-{secrets.token_hex(8)}",
            user_id=current_user.id,
            code_hash=two_factor.hash_recovery_code(code),
        ))
    db.commit()

    _audit(db, _first_company(db, current_user.id), current_user.name, "alterar",
           "Ativou a verificação em dois passos")
    return {"status": "success", "recovery_codes": codes}


@router.post("/2fa/disable")
def two_factor_disable(body: TwoFactorDisable, http: Request,
                       current_user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """Desliga a 2FA. Pede a palavra-passe e um código (da app ou de recuperação)."""
    if not current_user.two_factor_enabled:
        raise HTTPException(status_code=400,
                            detail="A verificação em dois passos não está ativa.")
    email = (current_user.email or "").strip().lower()
    address = _client_ip(http)
    locked = max(login_guard.seconds_locked(email), login_guard.seconds_locked(address))
    if locked:
        raise _too_many(locked)

    if not verify_password(body.password, current_user.hashed_password):
        login_guard.register_failure(email)
        login_guard.register_failure(address, max_attempts=login_guard.MAX_ATTEMPTS_PER_IP)
        raise HTTPException(status_code=403, detail="A palavra-passe não está correta")
    if not _check_second_factor(db, current_user, body.code):
        raise _register_code_failure(db, current_user, address,
                                     "Código errado ao desativar a verificação em dois passos")

    current_user.two_factor_enabled = False
    current_user.totp_secret = None
    current_user.totp_pending_secret = None
    current_user.totp_last_step = None
    current_user.two_factor_enabled_at = None
    db.query(TwoFactorRecoveryCode).filter(
        TwoFactorRecoveryCode.user_id == current_user.id).delete()
    db.commit()

    _audit(db, _first_company(db, current_user.id), current_user.name, "alterar",
           "Desativou a verificação em dois passos")
    return {
        "status": "success",
        "two_factor_setup_required": _policy_requires(db, current_user.id),
    }


@router.put("/2fa/policy")
def set_two_factor_policy(body: TwoFactorPolicy,
                          current_user: User = Depends(get_current_user),
                          membership: UserMembership = Depends(get_current_membership),
                          db: Session = Depends(get_db)):
    """Obriga (ou deixa de obrigar) a equipa da empresa ativa a usar 2FA."""
    if membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Só o proprietário ou um administrador pode mudar esta política.",
        )
    if body.require_two_factor and not current_user.two_factor_enabled:
        raise HTTPException(
            status_code=400,
            detail="Ative primeiro a verificação em dois passos na sua própria conta.",
        )
    company = db.query(Company).filter(Company.id == membership.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    company.require_two_factor = body.require_two_factor
    db.commit()
    _audit(db, company.id, current_user.name, "alterar",
           "Passou a obrigar a equipa a usar verificação em dois passos"
           if body.require_two_factor else
           "Deixou de obrigar a equipa a usar verificação em dois passos")
    return {"company_id": company.id, "require_two_factor": bool(company.require_two_factor)}
