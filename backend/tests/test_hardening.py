"""Defeitos encontrados na revisão de Outubro de 2026, fixados para não voltarem.

Cada teste descreve o que acontecia antes — um 500, um "guardado" que não
guardava, uma porta aberta — e o que a aplicação faz agora.
"""
from app.core.config import settings


def _invite_and_join(client, tenant, email, role):
    invitation = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                             {"email": email, "role": role}).json()
    joined = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": email.split("@")[0], "password": "a chave da porta",
    }).json()
    return {"Authorization": f"Bearer {joined['access_token']}", "X-Company-Id": tenant.company_id}


CSV = "Data;Descrição;Valor\n2026-09-01;Pagamento EDP;-123,00\n2026-09-02;Recebimento cliente;500,00\n"


# --- Extractos bancários --------------------------------------------------

def test_a_bank_statement_upload_completes(tenant):
    """Rebentava sempre com NameError e deixava o extracto preso em "processing"."""
    res = tenant.client.post("/api/v1/bank/upload", headers=tenant.headers,
                             files={"file": ("extrato.csv", CSV.encode("utf-8"), "text/csv")})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "completed"
    statements = tenant.get("/api/v1/bank/statements").json()
    assert all(s["status"] != "processing" for s in statements)


def test_a_viewer_cannot_upload_a_statement_but_can_list_them(client, tenant):
    viewer = _invite_and_join(client, tenant, "leitor-banco@exemplo.pt", "viewer")
    upload = client.post("/api/v1/bank/upload", headers=viewer,
                         files={"file": ("extrato.csv", CSV.encode("utf-8"), "text/csv")})
    assert upload.status_code == 403
    assert client.get("/api/v1/bank/statements", headers=viewer).status_code == 200


# --- Webhooks ---------------------------------------------------------------

def test_webhooks_are_closed_without_a_secret(client, tenant, monkeypatch):
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", "")
    res = client.post("/api/v1/webhooks/email", json={"company_id": tenant.company_id})
    assert res.status_code == 503
    assert tenant.get("/api/v1/documents/").json() == []


def test_webhooks_check_the_secret_and_the_company(client, tenant, monkeypatch):
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", "s3gredo-partilhado")
    wrong = client.post("/api/v1/webhooks/email", headers={"X-Webhook-Secret": "outro"},
                        json={"company_id": tenant.company_id})
    assert wrong.status_code == 401
    unknown = client.post("/api/v1/webhooks/email", headers={"X-Webhook-Secret": "s3gredo-partilhado"},
                          json={"company_id": "COMP-NAO-EXISTE"})
    assert unknown.status_code == 404


def test_a_webhook_document_carries_no_invented_figures(client, tenant, monkeypatch):
    """Cada email entrava como uma fatura de 450 € de "Marketing"."""
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", "s3gredo-partilhado")
    res = client.post("/api/v1/webhooks/email", headers={"X-Webhook-Secret": "s3gredo-partilhado"},
                      json={"company_id": tenant.company_id, "sender": "faturas@edp.pt",
                            "filename": "fatura.pdf"})
    assert res.status_code == 200
    doc = tenant.get("/api/v1/documents/").json()[0]
    assert not doc.get("extracted_amount")
    assert not doc.get("ai_confidence")


# --- Equipa -------------------------------------------------------------------

def test_an_admin_cannot_remove_an_owner(client, tenant):
    admin = _invite_and_join(client, tenant, "admin-equipa@exemplo.pt", "admin")
    _invite_and_join(client, tenant, "socio@exemplo.pt", "admin")
    members = tenant.get(f"/api/v1/companies/{tenant.company_id}/members").json()
    partner = next(m for m in members if m.get("email") == "socio@exemplo.pt")
    promoted = tenant.patch(f"/api/v1/companies/{tenant.company_id}/members/{partner['user_id']}",
                            {"role": "owner"})
    assert promoted.status_code == 200, promoted.text

    removed = client.delete(f"/api/v1/companies/{tenant.company_id}/members/{partner['user_id']}",
                            headers=admin)
    assert removed.status_code == 403


# --- Lançamentos ----------------------------------------------------------------

def _payload(tenant, **extra):
    category = tenant.category("expense")
    return {"date": "2026-09-01", "type": "expense", "description": "Renda", "entity_name": "Senhorio",
            "category_id": category["id"], "category_name": category["name"], "amount": 300, **extra}


def test_a_badly_written_due_date_is_refused(tenant):
    """"31/08/2026" era gravado e rebentava depois nas prestações."""
    assert tenant.post("/api/v1/transactions/", _payload(tenant, due_date="31/08/2026")).status_code == 400
    trx = tenant.post("/api/v1/transactions/", _payload(tenant)).json()
    assert tenant.patch(f"/api/v1/transactions/{trx['id']}", {"due_date": "amanhã"}).status_code == 400
    preview = tenant.get(f"/api/v1/transactions/{trx['id']}/installments/preview?count=3&first_due_date=abc")
    assert preview.status_code == 400


def test_clearing_a_required_field_is_a_message_not_a_crash(tenant):
    trx = tenant.post("/api/v1/transactions/", _payload(tenant)).json()
    res = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"description": None})
    assert res.status_code == 400


def test_a_transaction_cannot_use_another_company_category(tenant, other_tenant):
    foreign = other_tenant.category("expense")
    res = tenant.post("/api/v1/transactions/", _payload(
        tenant, category_id=foreign["id"], category_name=foreign["name"]))
    assert res.status_code == 400


# --- Documentos e painel --------------------------------------------------------

def test_a_document_with_a_euro_sign_in_its_name_downloads(tenant):
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    up = tenant.client.post("/api/v1/documents/upload", headers=tenant.headers,
                            files={"file": ("fatura–agosto €.pdf", pdf, "application/pdf")})
    assert up.status_code == 201, up.text
    doc_id = up.json()["document"]["id"]
    res = tenant.get(f"/api/v1/documents/{doc_id}/file")
    assert res.status_code == 200
    assert "filename*=UTF-8''" in res.headers["content-disposition"]


def test_an_absurd_dashboard_window_is_refused(tenant):
    assert tenant.get("/api/v1/dashboard/summary?months=100000").status_code == 422


# --- Sessões e contas -------------------------------------------------------------

def test_changing_the_password_ends_the_other_sessions(client, tenant):
    old_headers = dict(tenant.headers)
    res = tenant.post("/api/v1/auth/change-password", {
        "current_password": "a chave da porta", "new_password": "outra chave bem comprida"})
    assert res.status_code == 200, res.text
    assert client.get("/api/v1/auth/me", headers=old_headers).status_code == 401
    fresh = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=fresh).status_code == 200


def test_an_email_is_one_account_whatever_the_capitals(client):
    first = client.post("/api/v1/auth/register", json={
        "name": "Ana", "email": "Ana.Maiusculas@exemplo.pt", "password": "a chave da porta",
        "company_name": "Ana Lda"})
    assert first.status_code == 201
    again = client.post("/api/v1/auth/register", json={
        "name": "Ana", "email": "ana.maiusculas@exemplo.pt", "password": "a chave da porta",
        "company_name": "Ana Dois Lda"})
    assert again.status_code == 400
    login = client.post("/api/v1/auth/login", json={
        "email": "ANA.MAIUSCULAS@exemplo.pt", "password": "a chave da porta"})
    assert login.status_code == 200


def test_the_full_record_of_a_customer_is_kept(tenant):
    """Morada, cidade, telemóvel… eram enviados pelo formulário e perdiam-se."""
    created = tenant.post("/api/v1/customers/", {
        "name": "Ferreira & Filhos", "mobile": "913000000", "city": "Braga",
        "postal_code": "4700-000", "internal_observations": "Paga sempre a 60 dias",
        "is_vat_exempt": True}).json()
    saved = next(c for c in tenant.get("/api/v1/customers/").json() if c["id"] == created["id"])
    assert saved["mobile"] == "913000000"
    assert saved["city"] == "Braga"
    assert saved["internal_observations"] == "Paga sempre a 60 dias"
    assert saved["is_vat_exempt"] is True
