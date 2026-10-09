"""Verificação em dois passos (TOTP) e a política da empresa que a torna obrigatória."""

import time
import uuid

import pyotp
import pytest

from app.core import two_factor
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.models.models import TwoFactorRecoveryCode, User

LOGIN = "/api/v1/auth/login"
LOGIN_2FA = "/api/v1/auth/login/2fa"
PASSWORD = "a chave da porta"


class Clock:
    """Relógio controlado: cada avanço passa para o passo de 30 s seguinte."""

    def __init__(self):
        self.now = time.time()

    def time(self):
        return self.now

    def tick(self):
        self.now += 30


@pytest.fixture
def clock(monkeypatch):
    fake = Clock()
    monkeypatch.setattr(two_factor, "time", fake)
    return fake


def _code(secret, clock):
    return pyotp.TOTP(secret).at(clock.now)


def _enable(tenant, clock):
    setup = tenant.post("/api/v1/auth/2fa/setup")
    assert setup.status_code == 200, setup.text
    data = setup.json()
    assert data["otpauth_uri"].startswith("otpauth://totp/")
    assert data["qr_svg"].startswith("data:image/svg+xml")
    enabled = tenant.post("/api/v1/auth/2fa/enable", {"code": _code(data["secret"], clock)})
    assert enabled.status_code == 200, enabled.text
    codes = enabled.json()["recovery_codes"]
    assert len(codes) == 8 and len(set(codes)) == 8
    clock.tick()
    return data["secret"], codes


def _password_step(client, email):
    response = client.post(LOGIN, json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["two_factor_required"] is True
    assert "access_token" not in body
    return body["challenge_token"]


def test_login_without_2fa_keeps_its_shape(client, tenant):
    body = client.post(LOGIN, json={"email": tenant.email, "password": PASSWORD}).json()
    assert set(body) == {"access_token", "token_type"}
    me = tenant.get("/api/v1/auth/me").json()
    assert me["two_factor_enabled"] is False
    assert me["two_factor_setup_required"] is False


def test_enable_then_login_needs_the_code(client, tenant, clock):
    secret, _ = _enable(tenant, clock)
    assert tenant.get("/api/v1/auth/me").json()["two_factor_enabled"] is True

    challenge = _password_step(client, tenant.email)
    # O desafio não é um token de acesso.
    assert client.get("/api/v1/auth/me",
                      headers={"Authorization": f"Bearer {challenge}"}).status_code == 401

    wrong = client.post(LOGIN_2FA, json={"challenge_token": challenge, "code": "000000"})
    assert wrong.status_code == 401

    ok = client.post(LOGIN_2FA, json={"challenge_token": challenge,
                                      "code": _code(secret, clock)})
    assert ok.status_code == 200, ok.text
    token = ok.json()["access_token"]
    assert client.get("/api/v1/auth/me",
                      headers={"Authorization": f"Bearer {token}"}).status_code == 200

    # O mesmo código não serve duas vezes.
    replay = client.post(LOGIN_2FA, json={"challenge_token": challenge,
                                          "code": _code(secret, clock)})
    assert replay.status_code == 401


def test_enable_rejects_a_wrong_code(tenant, clock):
    tenant.post("/api/v1/auth/2fa/setup")
    assert tenant.post("/api/v1/auth/2fa/enable", {"code": "123456"}).status_code == 400
    assert tenant.get("/api/v1/auth/me").json()["two_factor_enabled"] is False


def test_recovery_codes_are_hashed_and_single_use(client, tenant, clock):
    _, codes = _enable(tenant, clock)
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == tenant.email).first()
        stored = {r.code_hash for r in db.query(TwoFactorRecoveryCode)
                  .filter(TwoFactorRecoveryCode.user_id == user.id)}
    assert codes[0] not in stored

    challenge = _password_step(client, tenant.email)
    first = client.post(LOGIN_2FA, json={"challenge_token": challenge, "code": codes[0].upper()})
    assert first.status_code == 200, first.text

    challenge = _password_step(client, tenant.email)
    again = client.post(LOGIN_2FA, json={"challenge_token": challenge, "code": codes[0]})
    assert again.status_code == 401

    status = tenant.get("/api/v1/auth/2fa/status").json()
    assert status["recovery_codes_remaining"] == 7


def test_failed_codes_lock_the_account(client, tenant, clock):
    secret, _ = _enable(tenant, clock)
    challenge = _password_step(client, tenant.email)
    statuses = [client.post(LOGIN_2FA, json={"challenge_token": challenge,
                                             "code": "000000"}).status_code
                for _ in range(5)]
    assert statuses == [401] * 5
    # Bloqueado: nem o código certo nem a palavra-passe passam agora.
    blocked = client.post(LOGIN_2FA, json={"challenge_token": challenge,
                                           "code": _code(secret, clock)})
    assert blocked.status_code == 429
    assert client.post(LOGIN, json={"email": tenant.email,
                                    "password": PASSWORD}).status_code == 429


def test_challenge_dies_with_the_password(client, tenant, clock):
    secret, _ = _enable(tenant, clock)
    challenge = _password_step(client, tenant.email)
    changed = tenant.post("/api/v1/auth/change-password", {
        "current_password": PASSWORD, "new_password": "outra frase bem comprida"})
    assert changed.status_code == 200
    stale = client.post(LOGIN_2FA, json={"challenge_token": challenge,
                                         "code": _code(secret, clock)})
    assert stale.status_code == 401


def test_garbage_challenge_is_refused(client):
    fake = create_access_token(subject="USR-1")
    for token in ("isto-nao-e-um-token", fake):
        response = client.post(LOGIN_2FA, json={"challenge_token": token, "code": "123456"})
        assert response.status_code == 401


def test_disable_needs_password_and_code(client, tenant, clock):
    secret, codes = _enable(tenant, clock)
    assert tenant.post("/api/v1/auth/2fa/disable",
                       {"password": "errada errada", "code": _code(secret, clock)}).status_code == 403
    assert tenant.post("/api/v1/auth/2fa/disable",
                       {"password": PASSWORD, "code": "000000"}).status_code == 401
    ok = tenant.post("/api/v1/auth/2fa/disable", {"password": PASSWORD, "code": codes[1]})
    assert ok.status_code == 200, ok.text
    assert tenant.get("/api/v1/auth/me").json()["two_factor_enabled"] is False
    body = client.post(LOGIN, json={"email": tenant.email, "password": PASSWORD}).json()
    assert "access_token" in body
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == tenant.email).first()
        assert user.totp_secret is None
        assert db.query(TwoFactorRecoveryCode).filter(
            TwoFactorRecoveryCode.user_id == user.id).count() == 0


def _invite_member(client, tenant, role="finance_manager"):
    email = f"membro-{uuid.uuid4().hex[:8]}@exemplo.pt"
    invitation = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                             {"email": email, "role": role})
    assert invitation.status_code == 201, invitation.text
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation.json()["token"], "name": "Membro", "password": PASSWORD,
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_company_policy_requires_setup(client, tenant, other_tenant, clock):
    member = _invite_member(client, tenant)

    # O dono tem de ter a 2FA ativa antes de a impor aos outros.
    refused = tenant.put("/api/v1/auth/2fa/policy", {"require_two_factor": True})
    assert refused.status_code == 400
    _enable(tenant, clock)
    on = tenant.put("/api/v1/auth/2fa/policy", {"require_two_factor": True})
    assert on.status_code == 200 and on.json()["require_two_factor"] is True

    # O membro continua a entrar, mas é mandado configurar.
    me = client.get("/api/v1/auth/me", headers=member).json()
    assert me["two_factor_setup_required"] is True
    status = client.get("/api/v1/auth/2fa/status", headers=member).json()
    assert status["company_requires"] is True and status["can_manage_policy"] is False

    # Um membro sem poderes de administração não muda a política.
    assert client.put("/api/v1/auth/2fa/policy", headers=member,
                      json={"require_two_factor": False}).status_code == 403

    # Outra empresa não é afetada.
    assert other_tenant.get("/api/v1/auth/me").json()["two_factor_setup_required"] is False
    assert other_tenant.get("/api/v1/auth/2fa/status").json()["company_requires"] is False

    off = tenant.put("/api/v1/auth/2fa/policy", {"require_two_factor": False})
    assert off.status_code == 200
    assert client.get("/api/v1/auth/me", headers=member).json()["two_factor_setup_required"] is False


def test_policy_cannot_be_set_on_a_company_you_do_not_belong_to(tenant, other_tenant, clock):
    _enable(other_tenant, clock)
    response = other_tenant.client.put(
        "/api/v1/auth/2fa/policy", headers=other_tenant.scoped(tenant.company_id),
        json={"require_two_factor": True})
    assert response.status_code == 404
    assert tenant.get("/api/v1/auth/2fa/status").json()["company_requires"] is False
