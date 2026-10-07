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
