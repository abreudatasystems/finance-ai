"""Verificação em dois passos (TOTP, RFC 6238).

Compatível com Google Authenticator, Microsoft Authenticator, 1Password, etc.
O QR é gerado aqui, em SVG, para o frontend não precisar de nenhuma biblioteca.

* Um código só é aceite uma vez: guarda-se o último passo de 30 s usado.
* Os códigos de recuperação são mostrados uma única vez e guardados com hash.
"""

from __future__ import annotations

import secrets
import time
from typing import Optional

import pyotp
import segno

from app.core.security import hash_token

ISSUER = "Finance AI"
RECOVERY_CODE_COUNT = 8
#: Tolerância de relógio: aceita o passo anterior e o seguinte (±30 s).
VALID_WINDOW = 1


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def qr_svg_data_uri(uri: str) -> str:
    return segno.make(uri, error="m").svg_data_uri(scale=5, border=2)


def _clean(code: str) -> str:
    return "".join(ch for ch in (code or "") if ch.isalnum()).lower()


def matching_step(secret: str, code: str, last_step: Optional[int] = None) -> Optional[int]:
    """O passo de tempo a que o código corresponde, ou None se não servir.

    Recusa um passo igual ou anterior ao último aceite — sem isto, quem visse
    o código por cima do ombro podia usá-lo durante os mesmos 30 segundos.
    """
    code = _clean(code)
    if not secret or len(code) != 6 or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    now_step = int(time.time()) // totp.interval
    for offset in range(-VALID_WINDOW, VALID_WINDOW + 1):
        step = now_step + offset
        if last_step is not None and step <= last_step:
            continue
        if secrets.compare_digest(totp.generate_otp(step), code):
            return step
    return None


def new_recovery_codes(count: int = RECOVERY_CODE_COUNT) -> list[str]:
    """Códigos legíveis, no formato xxxxx-xxxxx (letras e números sem ambiguidade)."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = []
    for _ in range(count):
        raw = "".join(secrets.choice(alphabet) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def hash_recovery_code(code: str) -> str:
    return hash_token(_clean(code))


def looks_like_recovery_code(code: str) -> bool:
    return len(_clean(code)) == 10
