"""What repeats books itself — once per period, never twice."""

import pytest


@pytest.fixture
def rent(tenant):
    category = tenant.category("expense")
    response = tenant.post("/api/v1/recurrences/", {
        "name": "Renda do escritório", "type": "expense", "description": "Renda mensal",
        "entity_name": "Imobiliária Silva", "category_id": category["id"],
        "category_name": category["name"], "amount": 615.00, "vat_rate": 23,
        "frequency": "monthly", "day_of_month": 8, "start_date": "2026-01-08",
    })
    assert response.status_code == 201, response.text
    return response.json()


def _run(tenant, until):
    return tenant.post("/api/v1/recurrences/run", {"until": until}).json()


def test_generation_books_every_period_that_is_due(tenant, rent):
    result = _run(tenant, "2026-03-31")
    assert result["gerados"] == 3
    due = [item["due_date"] for item in result["detalhe"][0]["lancamentos"]]
    assert due == ["2026-01-08", "2026-02-08", "2026-03-08"]


def test_running_twice_cannot_double_the_rent(tenant, rent):
    _run(tenant, "2026-03-31")
    assert _run(tenant, "2026-03-31")["gerados"] == 0


def test_an_occurrence_is_an_obligation_not_a_payment(tenant, rent):
    _run(tenant, "2026-01-31")
    trx = [t for t in tenant.get("/api/v1/transactions/").json() if t["source"] == "recurring"][0]
    assert float(trx["paid_amount"]) == 0
    assert trx["payment_status"] in ("pending", "overdue")
    assert float(trx["net_amount"]) + float(trx["vat_amount"]) == float(trx["amount"])


def test_a_skipped_period_stays_skipped(tenant, rent):
    _run(tenant, "2026-05-31")
    assert tenant.post(f"/api/v1/recurrences/{rent['id']}/skip", {"period": "2026-06"}).status_code == 200
    assert _run(tenant, "2026-06-30")["gerados"] == 0

    history = tenant.get(f"/api/v1/recurrences/{rent['id']}").json()["historico"]
    assert any(row["period"] == "2026-06" and row["status"] == "skipped" for row in history)


def test_an_end_date_stops_the_generation(tenant, rent):
    _run(tenant, "2026-06-30")
    tenant.patch(f"/api/v1/recurrences/{rent['id']}", {"end_date": "2026-07-31"})
    assert _run(tenant, "2026-12-31")["gerados"] == 1     # only July


def test_day_31_lands_on_the_last_day_of_a_short_month(tenant):
    category = tenant.category("expense")
    rule = tenant.post("/api/v1/recurrences/", {
        "name": "Seguro", "description": "Seguro mensal", "amount": 100.0,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "monthly", "day_of_month": 31, "start_date": "2026-01-31",
    }).json()
    result = tenant.post("/api/v1/recurrences/run",
                         {"until": "2026-03-31", "recurrence_id": rule["id"]}).json()
    due = [item["due_date"] for item in result["detalhe"][0]["lancamentos"]]
    assert due == ["2026-01-31", "2026-02-28", "2026-03-31"]


def test_quarterly_rules_use_quarter_keys(tenant):
    category = tenant.category("expense")
    rule = tenant.post("/api/v1/recurrences/", {
        "name": "Avença", "description": "Avença trimestral", "amount": 300.0,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "quarterly", "start_date": "2026-01-15",
    }).json()
    result = tenant.post("/api/v1/recurrences/run",
                         {"until": "2026-12-31", "recurrence_id": rule["id"]}).json()
    periods = [item["period"] for item in result["detalhe"][0]["lancamentos"]]
    assert periods == ["2026-T1", "2026-T2", "2026-T3", "2026-T4"]


def test_upcoming_lists_what_is_not_booked_yet(tenant, rent):
    upcoming = tenant.get("/api/v1/recurrences/upcoming?days=365").json()
    assert upcoming
    assert all(item["recurrence_id"] == rent["id"] for item in upcoming)


def test_invalid_rules_are_refused(tenant):
    assert tenant.post("/api/v1/recurrences/", {
        "name": "X", "description": "x", "amount": -5,
        "frequency": "monthly", "start_date": "2026-01-01"}).status_code == 400
    assert tenant.post("/api/v1/recurrences/", {
        "name": "X", "description": "x", "amount": 10,
        "frequency": "diaria", "start_date": "2026-01-01"}).status_code == 400


def test_a_rule_that_fired_is_paused_instead_of_deleted(tenant, rent):
    _run(tenant, "2026-02-28")
    assert tenant.delete(f"/api/v1/recurrences/{rent['id']}").json()["status"] == "paused"


def test_a_rule_that_never_fired_is_deleted(tenant):
    rule = tenant.post("/api/v1/recurrences/", {
        "name": "Nunca correu", "description": "x", "amount": 10.0,
        "frequency": "monthly", "start_date": "2099-01-01"}).json()
    assert tenant.delete(f"/api/v1/recurrences/{rule['id']}").json()["status"] == "deleted"


def test_generation_never_touches_another_company(tenant, other_tenant, rent):
    assert other_tenant.get(f"/api/v1/recurrences/{rent['id']}").status_code == 404
    assert other_tenant.post("/api/v1/recurrences/run", {}).json()["gerados"] == 0
