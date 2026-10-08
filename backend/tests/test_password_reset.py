"""Recuperação de palavra-passe por email.

O link vai só por email (o transporte é substituído aqui), o token guarda-se
com hash, é de uso único, expira, e a resposta nunca revela se a conta existe.
"""

import re
from datetime import timedelta

import pytest

from app.api.v1 import auth as auth_module
from app.core.security import hash_token
from app.db.session import SessionLocal
from app.models.models import PasswordResetToken, User
from app.services import mailer

FORGOT = "/api/v1/auth/forgot-password"
RESET = "/api/v1/auth/reset-password"
LOGIN = "/api/v1/auth/login"
NEW_PASSWORD = "uma frase nova e comprida"


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "_transport", lambda message: sent.append(message))
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.exemplo.pt")
    monkeypatch.setattr(mailer.settings, "APP_BASE_URL", "https://app.exemplo.pt")
    return sent


def _token_from(message) -> str:
    body = message.get_body(preferencelist=("plain",)).get_content()
    match = re.search(r"https://app\.exemplo\.pt/reset-password/([A-Za-z0-9_\-]+)", body)
    assert match, body
    return match.group(1)


def test_no_account_enumeration(client, tenant, outbox):
    known = client.post(FORGOT, json={"email": tenant.email})
    unknown = client.post(FORGOT, json={"email": "ninguem-aqui@exemplo.pt"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    # O link nunca vai na resposta.
    assert "reset-password" not in known.text
    assert len(outbox) == 1
    assert outbox[0]["To"] == tenant.email


def test_only_the_hash_is_stored(client, tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email.upper()})
    token = _token_from(outbox[-1])
    with SessionLocal() as db:
        assert db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == token).first() is None
        assert db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == hash_token(token)).first() is not None


def test_reset_sets_password_ends_sessions_and_is_single_use(client, tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email})
    token = _token_from(outbox[-1])

    ok = client.post(RESET, json={"token": token, "new_password": NEW_PASSWORD})
    assert ok.status_code == 200, ok.text

    # A sessão antiga caiu, a palavra-passe antiga deixou de servir.
    assert tenant.get("/api/v1/auth/me").status_code == 401
    assert client.post(LOGIN, json={"email": tenant.email,
                                    "password": "a chave da porta"}).status_code == 401
    assert client.post(LOGIN, json={"email": tenant.email,
                                    "password": NEW_PASSWORD}).status_code == 200

    again = client.post(RESET, json={"token": token, "new_password": "outra frase bem comprida"})
    assert again.status_code == 400


def test_new_request_invalidates_the_previous_link(client, tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email})
    first = _token_from(outbox[-1])
    client.post(FORGOT, json={"email": tenant.email})
    second = _token_from(outbox[-1])
    assert first != second
    assert client.post(RESET, json={"token": first, "new_password": NEW_PASSWORD}).status_code == 400
    assert client.post(RESET, json={"token": second, "new_password": NEW_PASSWORD}).status_code == 200


def test_expired_link_is_refused(client, tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email})
    token = _token_from(outbox[-1])
    with SessionLocal() as db:
        row = db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == hash_token(token)).first()
        row.expires_at = row.created_at - timedelta(minutes=1)
        db.commit()
    response = client.post(RESET, json={"token": token, "new_password": NEW_PASSWORD})
    assert response.status_code == 400
    assert "expirou" in response.json()["detail"]


def test_password_rules_still_apply(client, tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email})
    token = _token_from(outbox[-1])
    weak = client.post(RESET, json={"token": token, "new_password": "curta"})
    assert weak.status_code == 400
    # Uma palavra-passe fraca não gasta o link.
    assert client.post(RESET, json={"token": token, "new_password": NEW_PASSWORD}).status_code == 200


def test_a_link_only_changes_its_own_account(client, tenant, other_tenant, outbox):
    client.post(FORGOT, json={"email": tenant.email})
    token = _token_from(outbox[-1])
    client.post(RESET, json={"token": token, "new_password": NEW_PASSWORD})
    # A outra conta não foi tocada.
    assert other_tenant.get("/api/v1/auth/me").status_code == 200
    assert client.post(LOGIN, json={"email": other_tenant.email,
                                    "password": "a chave da porta"}).status_code == 200


def test_without_smtp_nothing_is_sent_and_link_is_not_leaked(client, tenant, monkeypatch):
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "")
    called = []
    monkeypatch.setattr(mailer, "_transport", lambda m: called.append(m))
    # Registo substituído diretamente: o fileConfig do Alembic (noutros testes)
    # desliga os loggers existentes, o que tornaria o caplog pouco fiável.
    warnings = []
    monkeypatch.setattr(auth_module.logger, "warning",
                        lambda msg, *args: warnings.append(msg % args))
    response = client.post(FORGOT, json={"email": tenant.email})
    assert response.status_code == 200
    assert "reset-password" not in response.text
    assert not called
    assert any("não está configurado" in w for w in warnings)
    assert all("reset-password/" not in w for w in warnings)


def test_bad_tokens_are_rate_limited_per_address(client):
    codes = [client.post(RESET, json={"token": f"inventado-{i}",
                                      "new_password": NEW_PASSWORD}).status_code
             for i in range(12)]
    assert codes[0] == 400
    assert 429 in codes


def test_forgot_password_is_rate_limited_per_address(client, outbox):
    codes = [client.post(FORGOT, json={"email": f"x{i}@exemplo.pt"}).status_code
             for i in range(12)]
    assert codes[0] == 200
    assert codes[-1] == 429


def test_one_inbox_cannot_be_flooded(client, tenant, outbox):
    for _ in range(6):
        assert client.post(FORGOT, json={"email": tenant.email}).status_code == 200
    assert len(outbox) == 3


def test_inactive_account_gets_no_email(client, tenant, outbox):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == tenant.email).first()
        user.active = False
        db.commit()
    assert client.post(FORGOT, json={"email": tenant.email}).status_code == 200
    assert outbox == []
