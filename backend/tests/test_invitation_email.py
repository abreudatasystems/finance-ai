"""Invitation email: sent when configured, honest about it when not.

The transport is replaced with a fake, so nothing here touches the network.
"""

import pytest

from app.services import mailer


@pytest.fixture
def outbox(monkeypatch):
    """Capture messages instead of sending them."""
    sent = []

    def fake_transport(message):
        sent.append(message)

    monkeypatch.setattr(mailer, "_transport", fake_transport)
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.exemplo.pt")
    monkeypatch.setattr(mailer.settings, "SMTP_FROM", "nao-responder@exemplo.pt")
    monkeypatch.setattr(mailer.settings, "APP_BASE_URL", "https://app.exemplo.pt")
    return sent


def _invite(tenant, email="convidado@exemplo.pt", role="finance_manager", message=None):
    response = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                           {"email": email, "role": role, "message": message})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_invitation_email_goes_out(tenant, outbox):
    result = _invite(tenant, "ana@exemplo.pt")
    assert result["email_result"]["enviado"] is True
    assert len(outbox) == 1

    message = outbox[0]
    assert message["To"] == "ana@exemplo.pt"
    assert "Finance AI" in message["Subject"]


def test_the_email_carries_the_link_the_person_opens(tenant, outbox):
    result = _invite(tenant, "ana@exemplo.pt")
    body = outbox[0].get_body(preferencelist=("plain",)).get_content()
    assert result["accept_url"] == f"https://app.exemplo.pt/invite/{result['token']}"
    assert result["accept_url"] in body


def test_the_email_says_who_invited_and_to_what_role(tenant, outbox):
    _invite(tenant, "ana@exemplo.pt", role="admin")
    body = outbox[0].get_body(preferencelist=("plain",)).get_content()
    assert "Administrador" in body
    assert "convidou-o" in body


def test_a_personal_note_travels_with_it(tenant, outbox):
    _invite(tenant, "ana@exemplo.pt", message="Vem tratar das faturas")
    body = outbox[0].get_body(preferencelist=("plain",)).get_content()
    assert "Vem tratar das faturas" in body


def test_there_is_an_html_part_too(tenant, outbox):
    _invite(tenant, "ana@exemplo.pt")
    html = outbox[0].get_body(preferencelist=("html",)).get_content()
    assert "Aceitar convite" in html


def test_without_smtp_the_invitation_still_works(tenant, monkeypatch):
    """No mail server: the link comes back to be copied, and it is valid."""
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "")
    result = _invite(tenant, "sem-email@exemplo.pt")

    assert result["email_result"]["enviado"] is False
    assert result["email_result"]["motivo"] == "not_configured"
    assert "link" in result["email_result"]["detalhe"]

    preview = tenant.client.get(f"/api/v1/invitations/token/{result['token']}")
    assert preview.status_code == 200


def test_a_broken_mail_server_does_not_lose_the_invitation(tenant, monkeypatch):
    def explode(message):
        raise OSError("connection refused")

    monkeypatch.setattr(mailer, "_transport", explode)
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.exemplo.pt")

    result = _invite(tenant, "falha@exemplo.pt")
    assert result["email_result"]["enviado"] is False
    assert result["email_result"]["motivo"] == "failed"
    assert tenant.client.get(f"/api/v1/invitations/token/{result['token']}").status_code == 200


def test_an_invitation_can_be_resent(tenant, outbox):
    invitation = _invite(tenant, "ana@exemplo.pt")
    outbox.clear()

    resent = tenant.post(f"/api/v1/invitations/{invitation['id']}/resend", {})
    assert resent.status_code == 200
    assert resent.json()["email_result"]["enviado"] is True
    assert len(outbox) == 1


def test_a_revoked_invitation_is_not_resent(tenant, outbox):
    invitation = _invite(tenant, "ana@exemplo.pt")
    tenant.delete(f"/api/v1/invitations/{invitation['id']}")
    response = tenant.post(f"/api/v1/invitations/{invitation['id']}/resend", {})
    assert response.status_code == 409


def test_only_an_admin_can_resend(client, tenant, outbox):
    invitation = _invite(tenant, "viewer@exemplo.pt", role="viewer")
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "Zé", "password": "segredo123",
    }).json()["access_token"]

    other = _invite(tenant, "outro@exemplo.pt")
    response = client.post(f"/api/v1/invitations/{other['id']}/resend",
                           headers={"Authorization": f"Bearer {token}"}, json={})
    assert response.status_code == 403


def test_another_companys_invitation_cannot_be_resent(tenant, other_tenant, outbox):
    invitation = _invite(tenant, "ana@exemplo.pt")
    assert other_tenant.post(f"/api/v1/invitations/{invitation['id']}/resend", {}).status_code == 404
