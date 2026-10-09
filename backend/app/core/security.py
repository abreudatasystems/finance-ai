import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Union

import bcrypt
from jose import jwt, JWTError

from app.core.config import settings

ALGORITHM = "HS256"

# bcrypt operates on the first 72 bytes only, so long passwords must be
# truncated consistently on both hash and verify.
_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def password_fingerprint(hashed_password: Optional[str]) -> str:
    """Uma impressão curta da palavra-passe guardada (já com hash).

    Vai dentro do token: quando a palavra-passe muda, a impressão muda e os
    tokens antigos deixam de valer — incluindo o de uma sessão emprestada.
    """
    return hashlib.sha256((hashed_password or "").encode("utf-8")).hexdigest()[:16]


def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None,
                        password_hash: Optional[str] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    if password_hash is not None:
        to_encode["pwd"] = password_fingerprint(password_hash)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_payload(token: str) -> Optional[dict]:
    """The token's claims, or None if the token is invalid or expired."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def decode_access_token(token: str) -> Optional[str]:
    """Return the token subject (user id) or None if the token is invalid."""
    payload = decode_access_payload(token)
    return payload.get("sub") if payload else None


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(plain_password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# Tokens de uso único (recuperação de palavra-passe) e desafio da 2FA
# --------------------------------------------------------------------------

#: Quanto tempo vale o desafio entre a palavra-passe e o código de 2FA.
TWO_FACTOR_CHALLENGE_MINUTES = 5


def hash_token(token: str) -> str:
    """SHA-256 de um token aleatório — é isto que se guarda, nunca o token."""
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def _challenge_key() -> str:
    # Chave derivada e diferente da das sessões: um token de desafio nunca
    # pode ser aceite como token de acesso (a assinatura simplesmente falha).
    return hashlib.sha256((settings.SECRET_KEY + ":2fa-challenge").encode("utf-8")).hexdigest()


def create_two_factor_challenge(user_id: str, password_hash: Optional[str]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TWO_FACTOR_CHALLENGE_MINUTES)
    claims = {"exp": expire, "sub": str(user_id), "typ": "2fa",
              "pwd": password_fingerprint(password_hash)}
    return jwt.encode(claims, _challenge_key(), algorithm=ALGORITHM)


def decode_two_factor_challenge(token: str) -> Optional[dict]:
    """As claims do desafio, ou None se for inválido, expirado ou de outro tipo."""
    try:
        payload = jwt.decode(token or "", _challenge_key(), algorithms=[ALGORITHM])
    except JWTError:
        return None
    return payload if payload.get("typ") == "2fa" and payload.get("sub") else None
