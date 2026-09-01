"""The export the accountant opens: SNC accounts, VAT per rate, settlement."""

import pytest


@pytest.fixture
def period_with_movements(tenant):
    """One simple expense, one revenue, and one invoice detailed by lines."""
    tenant.post("/api/v1/entities/", {
        "name": "EDP Comercial", "nif": "503504564", "is_supplier": True})
    power = tenant.subcategory("Eletricidade e Água")
    services = next(c for c in tenant.categories() if c["name"] == "Prestação de Serviços")

    expense = tenant.book("expense", 123.00, date="2026-08-12", due_date="2026-09-12",
                          description="Fatura de eletricidade", entity_name="EDP Comercial",
                          category=power, document_number="FT 2026/1")
    tenant.book("income", 1230.00, date="2026-08-12", paid=True, category=services,
                description="Consultoria de agosto", entity_name="Cliente Silva")

    mixed = tenant.book("expense", 100.00, date="2026-08-12", category=power,
                        description="Compras supermercado", entity_name="Continente")
    tenant.put(f"/api/v1/transactions/{mixed['id']}/lines", {"lines": [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Detergente", "net_amount": 40.00, "vat_rate": 23},
    ]})
    return {"expense": expense, "mixed": mixed}


def test_the_ledger_carries_the_snc_account_and_the_nif(tenant, period_with_movements):
    package = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()
    rows = package["razao"]
    edp = next(r for r in rows if r["Entidade"] == "EDP Comercial")
    assert edp["NIF"] == "503504564"
    assert edp["Conta SNC"] == "6241", "a subcategoria tem conta própria, mais precisa"
    assert {r["Conta SNC"] for r in rows} >= {"6241", "72"}


def test_a_mixed_invoice_is_exported_line_by_line(tenant, period_with_movements):
    rows = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["razao"]
    mixed = [r for r in rows if r["Descrição"].startswith("Compras supermercado")]
    assert len(mixed) == 3, "duas linhas mais a linha de fecho do documento"
    assert {r["Taxa IVA"] for r in mixed} == {6.0, 23.0, "misto"}


def test_the_vat_sheet_matches_the_apuramento(tenant, period_with_movements):
    package = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()
    liquidado = [r for r in package["iva"] if r["Sentido"].startswith("IVA liquidado")]
    assert liquidado[0]["IVA"] == 230.0
    assert package["apuramento"]["situacao"] == "a_entregar"
    assert package["prazos"]["pagamento_ate"]


def test_the_control_totals_add_up(tenant, period_with_movements):
    totals = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["totais"]
    assert abs(totals["receita_base"] - 1000.0) < 0.01
    assert abs(totals["receita_iva"] - 230.0) < 0.01


def test_the_csv_is_written_for_portuguese_excel(tenant, period_with_movements):
    response = tenant.get("/api/v1/reports/accounting/ledger.csv?period=2026-T3")
    body = response.content.decode("utf-8")
    assert response.status_code == 200
    assert body.startswith("﻿"), "sem BOM o Excel estraga os acentos"
    assert ";" in body.splitlines()[0]
    assert "123,00" in body, "os decimais têm de usar vírgula"
    assert "razao-" in response.headers["content-disposition"]


def test_the_vat_csv_downloads(tenant, period_with_movements):
    response = tenant.get("/api/v1/reports/accounting/vat.csv?period=2026-T3")
    assert response.status_code == 200
    assert len(response.content.decode("utf-8").splitlines()) > 1


def test_a_cancelled_document_leaves_the_ledger(tenant, period_with_movements):
    before = len(tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["razao"])
    tenant.patch(f"/api/v1/transactions/{period_with_movements['expense']['id']}",
                 {"status": "cancelled"})
    after = len(tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["razao"])
    assert after == before - 1


def test_the_booking_date_is_the_documents_own(tenant, period_with_movements):
    """An August invoice entered in September is an August document."""
    rows = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["razao"]
    assert {r["Data"] for r in rows} == {"2026-08-12"}


def test_the_settlement_state_travels_with_the_document(tenant, period_with_movements):
    rows = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()["razao"]
    revenue = next(r for r in rows if r["Descrição"] == "Consultoria de agosto")
    assert revenue["Estado"] == "Liquidado"
    assert revenue["Em aberto"] == 0.0


def test_an_invalid_period_is_refused(tenant):
    assert tenant.get("/api/v1/reports/accounting?period=2026-13").status_code == 400


def test_another_companys_ledger_is_empty(other_tenant, period_with_movements):
    package = other_tenant.get("/api/v1/reports/accounting?period=2026-T3").json()
    assert package["razao"] == []
