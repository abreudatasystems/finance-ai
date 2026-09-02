"""Orçamento face ao realizado.

The tests that matter: the realizado must agree with the income statement to
the cent (same accrual, net-of-VAT basis), and a deviation must read the right
way round — spending less than planned is good news, earning less is not.
"""


def _plan(tenant, category: dict, period: str, amount: float):
    response = tenant.put("/api/v1/budgets/", {
        "category_id": category["id"], "period": period, "amount": amount,
    })
    assert response.status_code == 200, response.text
    return response.json()


def _compare(tenant, period: str) -> dict:
    return tenant.get(f"/api/v1/budgets/comparison?period={period}").json()


def _line(data: dict, name: str) -> dict:
    return next(row for row in data["linhas"] if row["categoria"] == name)


# ---------------------------------------------------------------------------
# The plan
# ---------------------------------------------------------------------------

def test_a_category_can_be_planned_and_replanned(tenant):
    category = tenant.category("expense")

    first = _plan(tenant, category, "2026-09", 1000)
    assert first["valor"] == 1000.0
    assert first["tipo"] == "expense"

    second = _plan(tenant, category, "2026-09", 1200)
    # The same plan corrected, not a second opinion alongside the first.
    assert second["id"] == first["id"]
    assert second["valor"] == 1200.0

    listed = tenant.get("/api/v1/budgets/?period=2026-09").json()
    assert len(listed["linhas"]) == 1


def test_a_negative_budget_is_refused(tenant):
    category = tenant.category("expense")
    response = tenant.put("/api/v1/budgets/", {
        "category_id": category["id"], "period": "2026-09", "amount": -50,
    })
    assert response.status_code == 400


def test_an_unparseable_period_is_refused(tenant):
    category = tenant.category("expense")
    response = tenant.put("/api/v1/budgets/", {
        "category_id": category["id"], "period": "setembro", "amount": 10,
    })
    assert response.status_code == 400


def test_a_category_from_another_company_cannot_be_planned(tenant, other_tenant):
    theirs = other_tenant.category("expense")
    response = tenant.put("/api/v1/budgets/", {
        "category_id": theirs["id"], "period": "2026-09", "amount": 100,
    })
    assert response.status_code == 404


def test_a_whole_month_can_be_saved_at_once(tenant):
    expense = tenant.category("expense")
    income = tenant.category("income")

    response = tenant.put("/api/v1/budgets/batch", {
        "period": "2026-10",
        "linhas": [
            {"category_id": expense["id"], "amount": 800},
            {"category_id": income["id"], "amount": 5000},
        ],
    })
    assert response.status_code == 200
    assert response.json()["guardados"] == 2


def test_a_budget_can_be_deleted(tenant):
    budget = _plan(tenant, tenant.category("expense"), "2026-09", 300)
    assert tenant.delete(f"/api/v1/budgets/{budget['id']}").status_code == 200
    assert tenant.get("/api/v1/budgets/?period=2026-09").json()["linhas"] == []


# ---------------------------------------------------------------------------
# Copying a month forward
# ---------------------------------------------------------------------------

def test_a_month_can_be_carried_into_the_next(tenant):
    expense = tenant.category("expense")
    income = tenant.category("income")
    _plan(tenant, expense, "2026-09", 900)
    _plan(tenant, income, "2026-09", 4000)

    result = tenant.post("/api/v1/budgets/copy",
                         {"origem": "2026-09", "destino": "2026-10"}).json()
    assert result["copiados"] == 2

    october = tenant.get("/api/v1/budgets/?period=2026-10").json()["linhas"]
    assert sorted(row["valor"] for row in october) == [900.0, 4000.0]


def test_copying_does_not_overwrite_a_decision_already_taken(tenant):
    expense = tenant.category("expense")
    _plan(tenant, expense, "2026-09", 900)
    _plan(tenant, expense, "2026-10", 1500)      # October was already decided

    result = tenant.post("/api/v1/budgets/copy",
                         {"origem": "2026-09", "destino": "2026-10"}).json()
    assert result["copiados"] == 0
    assert result["ignorados"] == 1

    october = tenant.get("/api/v1/budgets/?period=2026-10").json()["linhas"]
    assert october[0]["valor"] == 1500.0


def test_copying_an_empty_month_says_so(tenant):
    response = tenant.post("/api/v1/budgets/copy",
                           {"origem": "2026-01", "destino": "2026-02"})
    assert response.status_code == 404


def test_copying_a_month_onto_itself_is_refused(tenant):
    _plan(tenant, tenant.category("expense"), "2026-09", 100)
    response = tenant.post("/api/v1/budgets/copy",
                           {"origem": "2026-09", "destino": "2026-09"})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# The comparison
# ---------------------------------------------------------------------------

def test_the_realizado_is_net_of_vat_like_the_income_statement(tenant):
    category = tenant.category("expense")
    _plan(tenant, category, "2026-09", 1000)
    # 1 230 € gross at 23% is a cost of 1 000 €; the VAT is the State's money.
    tenant.book("expense", 1230.00, date="2026-09-10", vat_rate=23, category=category)

    line = _line(_compare(tenant, "2026-09"), category["name"])
    assert line["realizado"] == 1000.0
    assert line["desvio"] == 0.0
    assert line["orcamento"] == 1000.0


def test_spending_less_than_planned_is_favourable(tenant):
    category = tenant.category("expense")
    _plan(tenant, category, "2026-09", 1000)
    tenant.book("expense", 600.00, date="2026-09-10", vat_rate=0, category=category)

    line = _line(_compare(tenant, "2026-09"), category["name"])
    assert line["realizado"] == 600.0
    assert line["desvio"] == -400.0
    assert line["sentido"] == "favorável"
    assert line["desvio_pct"] == -40.0


def test_earning_less_than_planned_is_not_favourable(tenant):
    category = tenant.category("income")
    _plan(tenant, category, "2026-09", 5000)
    tenant.book("income", 3000.00, date="2026-09-10", vat_rate=0, category=category)

    line = _line(_compare(tenant, "2026-09"), category["name"])
    assert line["desvio"] == -2000.0
    # The same negative gap, the opposite reading.
    assert line["sentido"] == "desfavorável"


def test_spending_more_than_planned_is_unfavourable(tenant):
    category = tenant.category("expense")
    _plan(tenant, category, "2026-09", 500)
    tenant.book("expense", 900.00, date="2026-09-10", vat_rate=0, category=category)

    line = _line(_compare(tenant, "2026-09"), category["name"])
    assert line["desvio"] == 400.0
    assert line["sentido"] == "desfavorável"


def test_a_category_spent_on_without_a_budget_is_surfaced(tenant):
    planned = tenant.category("expense")
    _plan(tenant, planned, "2026-09", 500)

    unplanned = tenant.subcategory("Combustíveis")
    tenant.book("expense", 320.00, date="2026-09-12", vat_rate=0, category=unplanned)

    data = _compare(tenant, "2026-09")
    line = _line(data, "Combustíveis")
    assert line["sem_orcamento"] is True
    assert line["realizado"] == 320.0
    assert "sem orçamento" in data["mensagem"]


def test_an_empty_month_is_still_a_sheet_that_can_be_filled_in(tenant):
    # The report doubles as the sheet the budget is typed on: with nothing
    # planned and nothing spent, the company's own headings are still rows.
    data = _compare(tenant, "2026-11")
    assert data["sem_orcamento"] is True
    assert len(data["linhas"]) > 0
    assert all(row["orcamento"] == 0 and row["realizado"] == 0 for row in data["linhas"])
    # An untouched heading is an empty line, not a finding.
    assert all(row["sem_orcamento"] is False for row in data["linhas"])


def test_documents_outside_the_month_do_not_count(tenant):
    category = tenant.category("expense")
    _plan(tenant, category, "2026-09", 1000)
    tenant.book("expense", 400.00, date="2026-08-31", vat_rate=0, category=category)
    tenant.book("expense", 500.00, date="2026-10-01", vat_rate=0, category=category)
    tenant.book("expense", 700.00, date="2026-09-30", vat_rate=0, category=category)

    line = _line(_compare(tenant, "2026-09"), category["name"])
    # Only the one dated inside September, last day included.
    assert line["realizado"] == 700.0


def test_the_totals_carry_the_result_of_the_month(tenant):
    income = tenant.category("income")
    expense = tenant.category("expense")
    _plan(tenant, income, "2026-09", 5000)
    _plan(tenant, expense, "2026-09", 3000)
    tenant.book("income", 6000.00, date="2026-09-05", vat_rate=0, category=income)
    tenant.book("expense", 2500.00, date="2026-09-06", vat_rate=0, category=expense)

    data = _compare(tenant, "2026-09")
    assert data["rendimentos"]["orcamento"] == 5000.0
    assert data["rendimentos"]["realizado"] == 6000.0
    assert data["gastos"]["realizado"] == 2500.0
    assert data["resultado"]["orcamento"] == 2000.0
    assert data["resultado"]["realizado"] == 3500.0
    assert data["resultado"]["sentido"] == "favorável"
    assert "acima do orçamentado" in data["mensagem"]


def test_a_month_with_no_budget_says_so_rather_than_showing_zeros(tenant):
    tenant.book("expense", 500.00, date="2026-09-10", vat_rate=0)
    data = _compare(tenant, "2026-09")
    assert data["sem_orcamento"] is True
    assert "Ainda não há orçamento" in data["mensagem"]


def test_the_comparison_agrees_with_the_income_statement(tenant):
    income = tenant.category("income")
    expense = tenant.category("expense")
    tenant.book("income", 4920.00, date="2026-09-04", vat_rate=23, category=income)
    tenant.book("expense", 1230.00, date="2026-09-08", vat_rate=23, category=expense)

    budget = _compare(tenant, "2026-09")
    dre = tenant.get("/api/v1/reports/income-statement?period=2026-09").json()
    subtotals = {row["key"]: row["amount"] for row in dre["subtotais"]}

    # Both go through financials, so the two reports agree to the cent — the
    # 4 920 € and 1 230 € booked are 4 000 € and 1 000 € net of 23%.
    assert budget["rendimentos"]["realizado"] == subtotals["total_rendimentos"] == 4000.0
    assert budget["gastos"]["realizado"] == subtotals["total_gastos"] == 1000.0
    assert budget["resultado"]["realizado"] == subtotals["resultado_liquido"]


# ---------------------------------------------------------------------------
# The year, and isolation
# ---------------------------------------------------------------------------

def test_the_year_view_has_twelve_months(tenant):
    _plan(tenant, tenant.category("expense"), "2026-03", 700)
    data = tenant.get("/api/v1/budgets/year?year=2026").json()

    assert len(data["meses"]) == 12
    march = next(m for m in data["meses"] if m["mes"] == 3)
    assert march["gastos"]["orcamento"] == 700.0
    assert march["tem_orcamento"] is True
    assert next(m for m in data["meses"] if m["mes"] == 4)["tem_orcamento"] is False


def test_budgets_are_scoped_to_the_active_company(tenant, other_tenant):
    _plan(other_tenant, other_tenant.category("expense"), "2026-09", 9999)
    assert tenant.get("/api/v1/budgets/?period=2026-09").json()["linhas"] == []


def test_another_company_budget_cannot_be_deleted(tenant, other_tenant):
    theirs = _plan(other_tenant, other_tenant.category("expense"), "2026-09", 100)
    assert tenant.delete(f"/api/v1/budgets/{theirs['id']}").status_code == 404
