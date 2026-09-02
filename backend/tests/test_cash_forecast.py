"""Previsão de tesouraria: the question a small company actually asks."""

import pytest

TODAY = "2026-09-02"


def _forecast(tenant, weeks=13, today=TODAY):
    response = tenant.get(f"/api/v1/transactions/cash-forecast?weeks={weeks}&today={today}")
    assert response.status_code == 200, response.text
    return response.json()


def _all_movements(forecast):
    return [m for week in forecast["semanas"] for m in week["movimentos"]]


def test_the_forecast_starts_from_real_cash_not_invoices(tenant):
    """An unpaid invoice does not open the forecast with money that is not there."""
    tenant.book("income", 12300.00, date="2026-08-01", due_date="2026-10-15",
                paid=False, category=tenant.category("income"))
    assert _forecast(tenant)["saldo_inicial"] == 0.0


def test_receivables_land_on_their_due_date(tenant):
    invoice = tenant.book("income", 6150.00, date="2026-08-20", due_date="2026-09-19",
                          paid=False, category=tenant.category("income"),
                          description="Loja online")
    movement = next(m for m in _all_movements(_forecast(tenant))
                    if m["reference"] == invoice["id"])
    assert movement["date"] == "2026-09-19"
    assert movement["kind"] == "in"
    assert movement["amount"] == 6150.0


def test_an_overdue_invoice_lands_today_not_in_the_past(tenant):
    """The earliest it can realistically arrive is now."""
    tenant.book("income", 1000.00, date="2026-07-01", due_date="2026-07-31",
                paid=False, category=tenant.category("income"))
    movement = next(m for m in _all_movements(_forecast(tenant)) if m["kind"] == "in")
    assert movement["date"] == TODAY
    assert movement["certainty"] == "vencido"


def test_next_months_rent_is_in_the_forecast(tenant):
    """A forecast that ignores the rent it knows is coming is not a forecast."""
    category = tenant.category("expense")
    tenant.post("/api/v1/recurrences/", {
        "name": "Renda do escritório", "description": "Renda mensal", "amount": 984.00,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "monthly", "day_of_month": 8, "start_date": "2026-09-08",
    })
    rent = [m for m in _all_movements(_forecast(tenant)) if m["origin"] == "recorrência"]
    assert len(rent) >= 3, "três meses de renda dentro de 13 semanas"
    assert all(m["certainty"] == "previsto" for m in rent)


def test_a_generated_recurrence_is_not_counted_twice(tenant):
    """Once booked it is a document; it must not also appear as a forecast."""
    category = tenant.category("expense")
    tenant.post("/api/v1/recurrences/", {
        "name": "Renda", "description": "Renda mensal", "amount": 984.00,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "monthly", "day_of_month": 8, "start_date": "2026-09-08",
    })
    tenant.post("/api/v1/recurrences/run", {"until": "2026-09-30"})

    september = [m for m in _all_movements(_forecast(tenant)) if m["date"].startswith("2026-09")]
    rents = [m for m in september if "Renda" in m["label"]]
    assert len(rents) == 1
    assert rents[0]["origin"] == "documento"


def test_the_vat_lands_on_its_statutory_date(tenant):
    """The quarter's VAT is payable by the 25th of the second following month."""
    tenant.book("income", 12300.00, date="2026-08-10", paid=True,
                category=tenant.category("income"))
    vat = next(m for m in _all_movements(_forecast(tenant)) if m["origin"] == "IVA")
    assert vat["date"] == "2026-11-25"
    assert vat["kind"] == "out"
    assert vat["amount"] == 2300.0


def test_the_running_balance_carries_from_week_to_week(tenant):
    tenant.book("income", 6150.00, date="2026-08-20", due_date="2026-09-10",
                paid=False, category=tenant.category("income"))
    weeks = _forecast(tenant)["semanas"]
    for previous, current in zip(weeks, weeks[1:]):
        assert current["saldo_inicial"] == previous["saldo_final"]
        assert round(current["saldo_final"], 2) == round(
            current["saldo_inicial"] + current["entradas"] - current["saidas"], 2)


def test_it_names_the_day_the_money_runs_out(tenant):
    """The whole point: a date, and what to do about it."""
    tenant.book("expense", 5000.00, date="2026-09-01", due_date="2026-09-25",
                paid=False, description="Fornecedor grande")
    forecast = _forecast(tenant)
    assert forecast["resumo"]["aperta"] is True
    assert forecast["fica_negativo_em"] is not None
    assert "negativa a partir de" in forecast["resumo"]["mensagem"]


def test_it_points_at_the_overdue_invoices_as_the_way_out(tenant):
    tenant.book("expense", 5000.00, date="2026-09-01", due_date="2026-09-25", paid=False)
    tenant.book("income", 4000.00, date="2026-07-01", due_date="2026-07-31",
                paid=False, category=tenant.category("income"))
    summary = _forecast(tenant)["resumo"]
    assert summary["recebimentos_vencidos"] == 4000.0
    assert "já vencidas por cobrar" in summary["mensagem"]


def test_a_healthy_company_is_told_so_plainly(tenant):
    invoice = tenant.book("income", 12300.00, date="2026-08-01", paid=False,
                          category=tenant.category("income"))
    tenant.post(f"/api/v1/transactions/{invoice['id']}/payments",
                {"amount": 12300.00, "payment_date": "2026-08-15"})
    summary = _forecast(tenant)["resumo"]
    assert summary["aperta"] is False
    assert "Sem apertos" in summary["mensagem"]


def test_every_movement_says_where_it_came_from(tenant):
    tenant.book("expense", 500.00, date="2026-09-01", due_date="2026-09-20", paid=False)
    for movement in _all_movements(_forecast(tenant)):
        assert movement["origin"] in ("documento", "recorrência", "IVA")
        assert movement["label"]


def test_the_horizon_is_configurable(tenant):
    assert len(_forecast(tenant, weeks=4)["semanas"]) == 4
    assert len(_forecast(tenant, weeks=26)["semanas"]) == 26


def test_another_companys_movements_are_not_in_the_forecast(tenant, other_tenant):
    tenant.book("expense", 5000.00, date="2026-09-01", due_date="2026-09-25", paid=False)
    assert _all_movements(_forecast(other_tenant)) == []


# --------------------------------------------------------------------------
# Settling several at once
# --------------------------------------------------------------------------

def test_several_obligations_are_settled_in_one_call(tenant):
    ids = [tenant.book("expense", 100.00 * n, date="2026-09-01", paid=False)["id"]
           for n in (1, 2, 3)]
    result = tenant.post("/api/v1/transactions/settle",
                         {"transaction_ids": ids, "payment_date": "2026-09-02"}).json()
    assert result["liquidados"] == 3
    assert result["total"] == 600.0

    for trx_id in ids:
        assert tenant.get(f"/api/v1/transactions/{trx_id}").json()["payment_status"] == "paid"


def test_one_bad_item_does_not_sink_the_batch(tenant):
    good = tenant.book("expense", 100.00, date="2026-09-01", paid=False)["id"]
    already = tenant.book("expense", 50.00, date="2026-09-01", paid=True)["id"]

    result = tenant.post("/api/v1/transactions/settle",
                         {"transaction_ids": [good, already, "NAO-EXISTE"]}).json()
    assert result["status"] == "partial"
    assert result["liquidados"] == 1
    assert result["falhados"] == 2


def test_settling_nothing_is_refused(tenant):
    assert tenant.post("/api/v1/transactions/settle", {"transaction_ids": []}).status_code == 400


def test_a_viewer_cannot_settle(client, tenant):
    invitation = tenant.post(f"/api/v1/invitations/company/{tenant.company_id}",
                             {"email": "consulta@exemplo.pt", "role": "viewer"}).json()
    token = client.post("/api/v1/invitations/register", json={
        "token": invitation["token"], "name": "Zé", "password": "a chave da porta",
    }).json()["access_token"]
    trx = tenant.book("expense", 100.00, date="2026-09-01", paid=False)

    response = client.post("/api/v1/transactions/settle",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"transaction_ids": [trx["id"]]})
    assert response.status_code == 403
