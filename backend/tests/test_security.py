"""Security: the rules that matter before real data goes in."""

import io

import pytest

from app.core import login_guard, passwords, uploads
from app.core.config import Settings, check_production_config
from tests.conftest import register


@pytest.fixture(autouse=True)
def clean_guard():
    """Failed-login state is process-wide; do not let it leak between tests."""
    login_guard.reset()
    yield
    login_guard.reset()


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

def test_a_short_password_is_refused():
    with pytest.raises(passwords.PasswordError) as exc:
        passwords.validate("curta123")
    assert "10 caracteres" in str(exc.value)


def test_the_obvious_passwords_are_refused():
    for guess in ("password123", "1234567890", "benfica"):
        with pytest.raises(passwords.PasswordError):
            passwords.validate(guess)


def test_a_password_cannot_be_the_persons_own_email_or_name():
    with pytest.raises(passwords.PasswordError):
        passwords.validate("anasilva2026", email="anasilva@exemplo.pt")
    with pytest.raises(passwords.PasswordError):
        passwords.validate("mariacosta123", name="Maria Costa")


def test_a_passphrase_is_accepted():
    passwords.validate("o pao de ontem", email="ana@exemplo.pt", name="Ana")


def test_registration_enforces_the_rules(client):
    response = client.post("/api/v1/auth/register", json={
        "name": "Ana", "email": "fraca@exemplo.pt",
        "password": "123456", "company_name": "Teste",
    })
    assert response.status_code == 400
    assert "10 caracteres" in response.json()["detail"]


# --------------------------------------------------------------------------
# Changing a password
# --------------------------------------------------------------------------

def test_changing_a_password_requires_the_current_one(tenant):
    response = tenant.post("/api/v1/auth/change-password", {
        "current_password": "errada-de-certeza", "new_password": "uma frase nova aqui",
    })
    assert response.status_code == 403


def test_a_password_can_be_changed_and_then_used(client, tenant):
    changed = tenant.post("/api/v1/auth/change-password", {
        "current_password": "a chave da porta", "new_password": "o pao de ontem",
    })
    assert changed.status_code == 200

    old = client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "a chave da porta"})
    assert old.status_code == 401

    login_guard.reset()
    new = client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "o pao de ontem"})
    assert new.status_code == 200


def test_the_new_password_must_pass_the_rules(tenant):
    response = tenant.post("/api/v1/auth/change-password", {
        "current_password": "a chave da porta", "new_password": "123456",
    })
    assert response.status_code == 400


def test_the_new_password_cannot_be_the_old_one(tenant):
    response = tenant.post("/api/v1/auth/change-password", {
        "current_password": "a chave da porta", "new_password": "a chave da porta",
    })
    assert response.status_code == 400


# --------------------------------------------------------------------------
# Guessing
# --------------------------------------------------------------------------

def test_repeated_failures_close_the_door_and_say_for_how_long(client, tenant):
    for _ in range(login_guard.MAX_ATTEMPTS):
        client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})

    blocked = client.post("/api/v1/auth/login",
                          json={"email": tenant.email, "password": "a chave da porta"})
    assert blocked.status_code == 429
    assert "minuto" in blocked.json()["detail"]


def test_the_last_attempts_are_announced(client, tenant):
    responses = [
        client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})
        for _ in range(login_guard.MAX_ATTEMPTS - 1)
    ]
    assert "Restam" in responses[-1].json()["detail"]


def test_getting_it_right_wipes_the_slate(client, tenant):
    client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})
    client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})
    ok = client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "a chave da porta"})
    assert ok.status_code == 200
    assert login_guard.seconds_locked(tenant.email) == 0


def test_one_account_being_locked_does_not_lock_another(client, tenant, other_tenant):
    for _ in range(login_guard.MAX_ATTEMPTS):
        client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})
    other = client.post("/api/v1/auth/login",
                        json={"email": other_tenant.email, "password": "a chave da porta"})
    assert other.status_code == 200


def test_failed_logins_reach_the_audit_trail(client, tenant):
    client.post("/api/v1/auth/login", json={"email": tenant.email, "password": "errada"})
    logs = tenant.get("/api/v1/audit/").json()
    assert any(log["action"] == "login_falhado" for log in logs)


# --------------------------------------------------------------------------
# Uploads
# --------------------------------------------------------------------------

def test_a_pdf_is_recognised_by_its_bytes():
    assert uploads.validate(b"%PDF-1.7\n...", "fatura.pdf") == "application/pdf"


def test_renaming_an_executable_does_not_make_it_an_invoice():
    with pytest.raises(uploads.UploadRejected):
        uploads.validate(b"\x7fELF\x02\x01\x01\x00binary", "fatura.pdf")


def test_an_oversized_file_is_refused():
    with pytest.raises(uploads.UploadRejected) as exc:
        uploads.validate(b"%PDF-" + b"0" * (uploads.MAX_BYTES + 1), "grande.pdf")
    assert "limite" in str(exc.value)


def test_an_empty_file_is_refused():
    with pytest.raises(uploads.UploadRejected):
        uploads.validate(b"", "vazio.pdf")


def test_the_upload_endpoint_refuses_what_it_should(tenant):
    response = tenant.client.post(
        "/api/v1/documents/upload",
        headers=tenant.headers,
        files={"file": ("fatura.pdf", io.BytesIO(b"\x7fELF\x02\x01binary"), "application/pdf")},
    )
    assert response.status_code == 400
    assert "Formato" in response.json()["detail"]


# --------------------------------------------------------------------------
# Production configuration
# --------------------------------------------------------------------------

def test_production_config_catches_an_ephemeral_secret(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    problems = check_production_config(Settings())
    assert any("SECRET_KEY" in problem for problem in problems)


def test_production_config_catches_localhost_cors_and_sqlite(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "x" * 48)
    settings = Settings()
    problems = check_production_config(settings)
    assert any("CORS" in p or "localhost" in p for p in problems)
    assert any("SQLite" in p for p in problems)


def test_a_sound_production_config_has_nothing_to_report(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "x" * 48)
    settings = Settings(
        DATABASE_URL="postgresql://user:pass@db/finance",
        BACKEND_CORS_ORIGINS="https://app.exemplo.pt",
    )
    assert check_production_config(settings) == []
