"""Um documento que chega sozinho tem de ser lido, e tem de saber a quem é.

Estes testes existem por causa de dois defeitos que viviam juntos no mesmo
ficheiro. O primeiro: os valores eram escritos no código — toda a fatura
recebida por email era registada como 450,00 € com 103,50 € de IVA, categoria
Marketing, 95% de confiança, e o anexo nunca era aberto. O segundo: a empresa
vinha do corpo do pedido, com ``COMP001`` por omissão, portanto quem chamasse
o endpoint escolhia em que livro escrevia.

O primeiro punha dinheiro inventado na contabilidade; o segundo punha-o na
contabilidade de outra pessoa. Nenhum dos dois tinha um único teste.
"""

import base64

import pytest

from app.db.session import SessionLocal
from app.models.models import AIApprovalItem, AIDocument, Company

INVOICE = (
    "GALP ENERGIA, S.A.\n"
    "NIF: 504499777\n"
    "Fatura n.o FT 2026/8891\n"
    "Data: 25/08/2026\n"
    "Vencimento: 09/09/2026\n"
    "Base tributavel: 172,68 EUR\n"
    "IVA 23%: 39,72 EUR\n"
    "Total: 212,40 EUR\n"
)


def _payload(content: str = INVOICE, name: str = "fatura.txt", **extra) -> dict:
    body = {
        "sender": "faturas@galp.pt",
        "filename": name,
        "content_base64": base64.b64encode(content.encode("utf-8")).decode(),
    }
    body.update(extra)
    return body


def _token(tenant) -> str:
    """Liga o canal automático desta empresa e devolve o segredo."""
    response = tenant.post("/api/v1/companies/ingest-token")
    assert response.status_code == 201, response.text
    return response.json()["token"]


def _post(client, path: str, payload: dict, token: str | None):
    headers = {"X-Ingest-Token": token} if token else {}
    return client.post(f"/api/v1/webhooks/{path}", json=payload, headers=headers)


def _documents(tenant) -> list:
    return tenant.get("/api/v1/documents/").json()


# ---------------------------------------------------------------------------
# A empresa vem do segredo, não do corpo
# ---------------------------------------------------------------------------

def test_without_a_token_nothing_is_written(client, tenant):
    response = _post(client, "email", _payload(), None)

    assert response.status_code == 401
    assert _documents(tenant) == []


def test_an_unknown_token_is_refused(client, tenant):
    response = _post(client, "email", _payload(), "inventado-por-quem-chamou")

    assert response.status_code == 401
    assert _documents(tenant) == []


def test_the_body_cannot_choose_the_company(client, tenant, other_tenant):
    """Era esta a linha: ``company_id = data.get("company_id", "COMP001")``.

    O token é da nossa empresa; o corpo pede a do vizinho. O documento tem de
    ficar onde o token manda, e o vizinho não pode ver nada.
    """
    token = _token(tenant)

    response = _post(client, "email",
                     _payload(company_id=other_tenant.company_id), token)
    assert response.status_code == 200, response.text

    ours = _documents(tenant)
    assert len(ours) == 1
    assert _documents(other_tenant) == []


def test_a_token_reaches_only_its_own_company(client, tenant, other_tenant):
    theirs = _token(other_tenant)

    assert _post(client, "email", _payload(), theirs).status_code == 200

    assert _documents(tenant) == []
    assert len(_documents(other_tenant)) == 1


def test_rotating_the_token_cuts_off_the_old_one(client, tenant):
    first = _token(tenant)
    second = _token(tenant)

    assert first != second
    assert _post(client, "email", _payload(), first).status_code == 401
    assert _post(client, "email", _payload(), second).status_code == 200


def test_disabling_the_channel_closes_it(client, tenant):
    token = _token(tenant)
    assert tenant.delete("/api/v1/companies/ingest-token").status_code == 204

    assert _post(client, "email", _payload(), token).status_code == 401


def test_only_an_administrator_sees_the_secret(client, tenant):
    """Quem tem o segredo escreve na fila de aprovações da empresa.

    Um utilizador de consulta pode ler os livros; poder abrir um canal por
    onde entram documentos, ou ver o segredo de um que já esteja aberto, é
    outra coisa.
    """
    invitation = tenant.post(
        f"/api/v1/invitations/company/{tenant.company_id}",
        {"email": f"consulta.webhook.{tenant.email}", "role": "viewer"},
    )
    assert invitation.status_code == 201, invitation.text

    joined = client.post("/api/v1/invitations/register", json={
        "token": invitation.json()["token"], "name": "Rita",
        "password": "a chave da porta",
    })
    assert joined.status_code == 201, joined.text
    guest = {"Authorization": f"Bearer {joined.json()['access_token']}"}

    assert client.get("/api/v1/transactions/", headers=guest).status_code == 200
    assert client.get("/api/v1/companies/ingest-token", headers=guest).status_code == 403
    assert client.post("/api/v1/companies/ingest-token", headers=guest).status_code == 403


# ---------------------------------------------------------------------------
# Os valores vêm do documento, não do código
# ---------------------------------------------------------------------------

def test_the_amounts_come_from_the_document(client, tenant):
    """Antes: 450,00 € e 103,50 € de IVA, sempre, fosse qual fosse o anexo."""
    token = _token(tenant)

    assert _post(client, "email", _payload(), token).status_code == 200

    document = _documents(tenant)[0]
    assert float(document["extracted_amount"]) == 212.40
    assert float(document["extracted_vat"]) == 39.72
    assert document["extracted_nif"] == "504499777"
    assert document["document_number"] == "FT 2026/8891"


def test_a_different_document_gives_different_numbers(client, tenant):
    """A prova de que se lê: dois anexos, dois resultados."""
    token = _token(tenant)
    other = INVOICE.replace("212,40", "97,50").replace("172,68", "79,27") \
                   .replace("39,72", "18,23").replace("FT 2026/8891", "FT 2026/9001")

    assert _post(client, "email", _payload(), token).status_code == 200
    assert _post(client, "email", _payload(other, "segunda.txt"), token).status_code == 200

    totals = sorted(float(d["extracted_amount"]) for d in _documents(tenant))
    assert totals == [97.50, 212.40]


def test_the_document_waits_for_a_human(client, tenant):
    """Ler não é lançar: o que entra fica em aprovação, não vira obrigação."""
    token = _token(tenant)
    _post(client, "email", _payload(), token)

    pending = tenant.get("/api/v1/approvals/").json()
    pending = pending if isinstance(pending, list) else pending.get("items", [])
    assert any(item["status"] == "pending" for item in pending)

    rows = tenant.get("/api/v1/transactions/").json()
    rows = rows if isinstance(rows, list) else rows.get("items", [])
    assert rows == []


def test_the_same_attachment_twice_is_one_document(client, tenant):
    """Um reenvio do fornecedor, ou da própria plataforma, não duplica nada."""
    token = _token(tenant)

    first = _post(client, "email", _payload(), token)
    second = _post(client, "email", _payload(), token)

    assert first.json()["status"] == "success"
    assert second.json()["status"] == "duplicate"
    assert second.json()["document_id"] == first.json()["document_id"]
    assert len(_documents(tenant)) == 1


def test_the_channel_is_recorded(client, tenant):
    token = _token(tenant)
    _post(client, "whatsapp", _payload(name="recibo.txt", phone="+351912000111"), token)

    assert _documents(tenant)[0]["channel"] == "whatsapp"


# ---------------------------------------------------------------------------
# O que entra é validado
# ---------------------------------------------------------------------------

def test_a_url_is_not_fetched(client, tenant):
    """Seguir uma ligação escolhida por terceiros aponta o servidor onde eles quiserem."""
    token = _token(tenant)

    response = _post(client, "whatsapp",
                     {"phone": "+351912000111",
                      "media_url": "http://169.254.169.254/latest/meta-data/"},
                     token)

    assert response.status_code == 400
    assert "URL" in response.json()["detail"]
    assert _documents(tenant) == []


def test_a_request_without_an_attachment_is_refused(client, tenant):
    token = _token(tenant)
    response = _post(client, "email", {"sender": "x@y.pt"}, token)

    assert response.status_code == 400
    assert _documents(tenant) == []


def test_content_that_is_not_base64_is_refused(client, tenant):
    token = _token(tenant)
    response = _post(client, "email",
                     {"filename": "f.txt", "content_base64": "isto não é base64!!"},
                     token)

    assert response.status_code == 400


def test_an_executable_disguised_as_an_invoice_is_refused(client, tenant):
    """O que conta são os bytes, não a extensão que o remetente escolheu."""
    token = _token(tenant)
    payload = _payload(name="fatura.pdf")
    payload["content_base64"] = base64.b64encode(b"MZ\x90\x00\x03" * 40).decode()

    response = _post(client, "email", payload, token)

    assert response.status_code == 400
    assert _documents(tenant) == []


# ---------------------------------------------------------------------------
# O segredo é por empresa
# ---------------------------------------------------------------------------

def test_a_new_company_starts_with_the_channel_closed(tenant):
    body = tenant.get("/api/v1/companies/ingest-token").json()

    assert body["token"] is None
    assert body["ativo"] is False


def test_two_companies_never_share_a_token(tenant, other_tenant):
    ours, theirs = _token(tenant), _token(other_tenant)
    assert ours != theirs

    db = SessionLocal()
    try:
        tokens = [row[0] for row in db.query(Company.ingest_token).all() if row[0]]
        assert len(tokens) == len(set(tokens))
    finally:
        db.close()
