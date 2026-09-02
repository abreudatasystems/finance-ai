"""Demonstração de Resultados: net of VAT, accrual, and it must tie to the ledger."""

import pytest


@pytest.fixture
def year_of_trading(tenant):
    """A small but complete year: sales, purchases, staff, rent, interest."""
    def cat(name):
        for parent in tenant.categories():
            if parent["name"] == name:
                return parent
            for child in parent.get("children", []):
                if child["name"] == name:
                    return child
        raise AssertionError(name)

    # Revenue: 10 000 € + 23% VAT
    tenant.book("income", 12300.00, date="2026-08-10", paid=True,
                category=cat("Prestação de Serviços"), description="Consultoria")
    # FSE: rent 5 000 € + 23%
    tenant.book("expense", 6150.00, date="2026-08-05",
                category=cat("Rendas e Alugueres"), description="Renda do escritório")
    # Staff: 3 000 €, no VAT
    tenant.book("expense", 3000.00, date="2026-08-25", vat_rate=0, paid=True,
                category=cat("Remunerações"), description="Salários")
    # Depreciation: 500 €
    tenant.book("expense", 500.00, date="2026-08-31", vat_rate=0,
                category=cat("Depreciações e Amortizações"), description="Depreciação")
    # Financing cost: 200 €
    tenant.book("expense", 200.00, date="2026-08-31", vat_rate=0,
                category=cat("Juros Suportados"), description="Juros do empréstimo")
    return tenant


def _statement(tenant, period="2026-T3"):
    response = tenant.get(f"/api/v1/reports/income-statement?period={period}")
    assert response.status_code == 200, response.text
    return response.json()


def _line(statement, key):
    return next(row for row in statement["linhas"] if row["key"] == key)


def _subtotal(statement, key):
    return next(row for row in statement["subtotais"] if row["key"] == key)


def test_revenue_is_net_of_vat(tenant, year_of_trading):
    """12 300 € invoiced at 23% is 10 000 € of revenue — the VAT is not income."""
    statement = _statement(tenant)
    assert _line(statement, "vendas")["amount"] == 10000.0


def test_expenses_land_on_their_snc_lines(tenant, year_of_trading):
    statement = _statement(tenant)
    assert _line(statement, "fse")["amount"] == 5000.0
    assert _line(statement, "pessoal")["amount"] == 3000.0
    assert _line(statement, "depreciacoes")["amount"] == 500.0
    assert _line(statement, "financiamento")["amount"] == 200.0


def test_the_subtotals_are_the_ones_a_bank_asks_for(tenant, year_of_trading):
    statement = _statement(tenant)
    assert _subtotal(statement, "ebitda")["amount"] == 2000.0        # 10000 - 8000
    assert _subtotal(statement, "ebit")["amount"] == 1500.0          # - 500 depreciation
    assert _subtotal(statement, "rai")["amount"] == 1300.0           # - 200 interest
    assert _subtotal(statement, "resultado_liquido")["amount"] == 1300.0


def test_margins_are_computed_on_revenue(tenant, year_of_trading):
    statement = _statement(tenant)
    assert statement["margens"]["ebitda"] == 20.0
    assert statement["margens"]["operacional"] == 15.0


def test_a_mixed_invoice_is_split_across_its_lines(tenant):
    """Lines carry their own category, so they carry their own SNC account."""
    def cat(name):
        for parent in tenant.categories():
            for child in parent.get("children", []):
                if child["name"] == name:
                    return child
        raise AssertionError(name)

    power = cat("Eletricidade e Água")
    staff = cat("Remunerações")
    trx = tenant.book("expense", 100.00, date="2026-08-12", category=power,
                      description="Fatura mista")
    tenant.put(f"/api/v1/transactions/{trx['id']}/lines", {"lines": [
        {"description": "Electricidade", "net_amount": 300.00, "vat_rate": 23,
         "category_id": power["id"], "category_name": power["name"]},
        {"description": "Trabalho temporário", "net_amount": 700.00, "vat_rate": 23,
         "category_id": staff["id"], "category_name": staff["name"]},
    ]})

    statement = _statement(tenant)
    assert _line(statement, "fse")["amount"] == 300.0
    assert _line(statement, "pessoal")["amount"] == 700.0


def test_nothing_disappears_when_a_category_has_no_snc_account(tenant):
    group = next(g for g in tenant.get("/api/v1/category-groups/").json() if g["kind"] == "expense")
    own = tenant.post("/api/v1/categories/", {"name": "Categoria sem conta", "group_id": group["id"]}).json()
    tenant.book("expense", 1230.00, date="2026-08-12", category=own, description="Gasto solto")

    statement = _statement(tenant)
    unmapped = _line(statement, "nao_classificado")
    assert unmapped["amount"] == 1000.0
    assert "SNC" in unmapped["hint"]


def test_the_statement_ties_to_the_ledger(tenant, year_of_trading):
    """Every movement of the period is on some line — none silently dropped."""
    statement = _statement(tenant)
    on_statement = sum(row["amount"] for row in statement["linhas"])

    package = tenant.get("/api/v1/reports/accounting?period=2026-T3").json()
    ledger = package["totais"]["receita_base"] + package["totais"]["despesa_base"]
    assert round(on_statement, 2) == round(ledger, 2)


def test_unpaid_invoices_still_count_towards_the_result(tenant):
    """Accrual basis: the rent is a cost of August even if nobody paid it."""
    def cat(name):
        for parent in tenant.categories():
            for child in parent.get("children", []):
                if child["name"] == name:
                    return child
        raise AssertionError(name)

    tenant.book("expense", 6150.00, date="2026-08-05", paid=False,
                category=cat("Rendas e Alugueres"), description="Renda por pagar")
    statement = _statement(tenant)
    assert _line(statement, "fse")["amount"] == 5000.0


def test_the_cash_bridge_explains_the_gap(tenant, year_of_trading):
    statement = _statement(tenant)
    bridge = statement["ponte_caixa"]
    assert bridge["resultado"] == 1300.0
    # Rent, depreciation and interest are unpaid; the sales receipt came in.
    assert bridge["a_pagar"] > 0
    assert bridge["saldo_em_conta"] != bridge["resultado"]


def test_the_previous_period_is_there_to_compare(tenant):
    def cat(name):
        for parent in tenant.categories():
            if parent["name"] == name:
                return parent
        raise AssertionError(name)

    tenant.book("income", 12300.00, date="2026-08-10", category=cat("Prestação de Serviços"))
    tenant.book("income", 6150.00, date="2026-05-10", category=cat("Prestação de Serviços"))

    statement = _statement(tenant, "2026-T3")
    sales = _line(statement, "vendas")
    assert sales["anterior"] == 5000.0
    assert sales["variacao"] == 5000.0
    assert sales["variacao_pct"] == 100.0


def test_the_basis_is_stated_not_assumed(tenant, year_of_trading):
    basis = _statement(tenant)["base"]
    assert "acréscimo" in basis["regime"]
    assert "sem IVA" in basis["iva"]
    assert "IRC" in basis["nota_irc"]


def test_another_company_sees_an_empty_statement(other_tenant, year_of_trading):
    statement = _statement(other_tenant)
    assert all(row["amount"] == 0 for row in statement["linhas"])
    assert _subtotal(statement, "resultado_liquido")["amount"] == 0.0
