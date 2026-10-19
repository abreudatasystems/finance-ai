"""Defeitos encontrados na revisão de QA de Outubro de 2026.

Cada teste prova um caso que estava errado: saldos que nunca mexiam, taxas
de retenção trocadas pela do catálogo, IVA de linhas esquecido, "Recorrente"
que não repetia nada, valores impossíveis que davam erro 500.
"""

from app.core.config import settings


def _accounts(tenant) -> list:
    response = tenant.get("/api/v1/bank-accounts/")
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Contas bancárias
# ---------------------------------------------------------------------------

def test_a_payment_without_account_moves_the_main_account(tenant):
    before = _accounts(tenant)[0]["current_balance"]
    tenant.book("expense", 123.00, paid=True)

    assert _accounts(tenant)[0]["current_balance"] == before - 123.00


def test_a_payment_goes_to_the_chosen_account_on_the_chosen_day(tenant):
    second = tenant.post("/api/v1/bank-accounts/", {"name": "Conta 2", "opening_balance": 1000}).json()
    trx = tenant.book("income", 200.00, paid=True, payment_date="2026-08-20", bank_account_id=second["id"])

    balances = {a["id"]: a["current_balance"] for a in _accounts(tenant)}
    assert balances[second["id"]] == 1200.00
    payments = tenant.get(f"/api/v1/transactions/{trx['id']}/payments").json()
    assert payments[0]["payment_date"] == "2026-08-20"


def test_another_companys_account_is_refused(tenant, other_tenant):
    foreign = _accounts(other_tenant)[0]["id"]
    trx = tenant.book("expense", 50.00)
    response = tenant.post(f"/api/v1/transactions/{trx['id']}/payments", {"bank_account_id": foreign})
    assert response.status_code == 404


def test_a_payment_date_in_another_format_is_refused(tenant):
    trx = tenant.book("expense", 50.00)
    response = tenant.post(f"/api/v1/transactions/{trx['id']}/payments", {"payment_date": "31/08/2026"})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Retenções e IVA
# ---------------------------------------------------------------------------

def test_a_manual_retention_rate_survives_an_amount_change(tenant):
    trx = tenant.book("expense", 1000.00, vat_rate=0, retention_code="irs_b_25", retention_rate=11.5)
    assert trx["retention_rate"] == 11.5

    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"amount": 2000.00}).json()
    assert updated["retention_rate"] == 11.5
    assert float(updated["retention_amount"]) == 230.00


def test_an_exempt_zero_rate_stays_zero(tenant):
    trx = tenant.book("expense", 1000.00, vat_rate=0, retention_code="irs_b_25", retention_rate=0)
    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"amount": 1500.00}).json()
    assert float(updated["retention_amount"] or 0) == 0


def test_changing_the_retention_code_proposes_the_catalog_rate(tenant):
    trx = tenant.book("expense", 1000.00, vat_rate=0, retention_code="isento")
    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"retention_code": "irs_b_25"}).json()
    assert updated["retention_rate"] == 25.0


def test_the_header_amount_of_a_document_with_lines_is_refused(tenant):
    trx = tenant.book("expense", 100.00)
    tenant.put(f"/api/v1/transactions/{trx['id']}/lines", {"lines": [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Detergente", "net_amount": 40.00, "vat_rate": 23},
    ]})
    response = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"amount": 500.00})
    assert response.status_code == 409
    # Mudar só a descrição continua a funcionar.
    ok = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"description": "Compras"})
    assert ok.status_code == 200


# ---------------------------------------------------------------------------
# Recorrências
# ---------------------------------------------------------------------------

def test_recurring_creates_a_monthly_rule_from_next_month(tenant):
    tenant.book("expense", 850.00, date="2026-08-05", is_recurring=True, description="Renda escritório")
    rules = tenant.get("/api/v1/recurrences/").json()
    rule = next(r for r in rules if r["description"] == "Renda escritório")
    assert rule["frequency"] == "monthly"
    assert rule["start_date"] == "2026-09-05"


def test_an_impossible_recurrence_is_a_clear_error(tenant):
    base = {"name": "X", "description": "X", "amount": 10, "start_date": "2026-09-01"}
    assert tenant.post("/api/v1/recurrences/", {**base, "day_of_month": -5}).status_code == 400
    assert tenant.post("/api/v1/recurrences/", {**base, "start_date": "2026-13-45"}).status_code == 400
    assert tenant.get("/api/v1/recurrences/").status_code == 200


# ---------------------------------------------------------------------------
# Valores impossíveis
# ---------------------------------------------------------------------------

def test_infinite_or_negative_rates_are_refused(tenant):
    cat = tenant.category("expense")
    base = {"type": "expense", "description": "x", "entity_name": "y",
            "category_id": cat["id"], "category_name": cat["name"], "is_paid": False}
    for bad in ({"amount": "Infinity"}, {"amount": "NaN"}, {"amount": 100, "vat_rate": -100}):
        response = tenant.client.post(
            "/api/v1/transactions/", headers=tenant.headers,
            content=__import__("json").dumps({**base, **bad}).replace('"Infinity"', "Infinity").replace('"NaN"', "NaN"),
        )
        assert response.status_code == 422, (bad, response.text)


def test_an_infinite_opening_balance_is_refused(tenant):
    response = tenant.client.post(
        "/api/v1/bank-accounts/", headers={**tenant.headers, "Content-Type": "application/json"},
        content='{"name": "Z", "opening_balance": Infinity}',
    )
    assert response.status_code == 422
    assert tenant.get("/api/v1/bank-accounts/").status_code == 200


def test_extreme_periods_are_a_message_not_a_crash(tenant):
    assert tenant.get("/api/v1/budgets/?period=9999-12").status_code == 400
    assert tenant.get("/api/v1/budgets/year?year=99999999999").status_code == 422
    assert tenant.get("/api/v1/retentions/position?period=9999-12").status_code == 400


def test_a_webhook_with_a_broken_body_is_a_400(client, monkeypatch):
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", "s3gredo")
    response = client.post(
        "/api/v1/webhooks/email", content="isto não é json",
        headers={"X-Webhook-Secret": "s3gredo", "Content-Type": "application/json"},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Configurações
# ---------------------------------------------------------------------------

def test_the_review_threshold_is_the_companys(tenant):
    response = tenant.patch(f"/api/v1/companies/{tenant.company_id}", {"ai_review_threshold": 92, "currency": "EUR"})
    assert response.status_code == 200, response.text
    assert tenant.get("/api/v1/approvals/summary").json()["limite_confianca"] == 92
    assert tenant.patch(f"/api/v1/companies/{tenant.company_id}", {"ai_review_threshold": 10}).status_code == 422
