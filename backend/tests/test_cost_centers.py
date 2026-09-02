"""Rentabilidade por projeto.

The figures must agree with the income statement — same accrual, net-of-VAT
basis — and whatever belongs to no project must appear as its own row rather
than quietly vanishing, or the report gives confident margins on a fraction of
the company and calls them the company's.
"""


def _project(tenant, name="Website Câmara", **extra):
    response = tenant.post("/api/v1/projects/", {"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def _book_on(tenant, project, kind="expense", amount=100.0, **extra):
    return tenant.book(kind, amount, cost_center_id=project["id"],
                       cost_center_name=project["nome"], **extra)


def _profit(tenant, start="2026-01-01", end="2027-01-01") -> dict:
    return tenant.get(f"/api/v1/projects/profitability?start={start}&end={end}").json()


def _row(data: dict, name: str) -> dict:
    return next(p for p in data["projetos"] if p["projeto"] == name)


# ---------------------------------------------------------------------------
# The projects themselves
# ---------------------------------------------------------------------------

def test_a_project_gets_a_code_when_none_is_given(tenant):
    first = _project(tenant, "Website Câmara")
    second = _project(tenant, "Loja online")

    assert first["codigo"] == "P-001"
    assert second["codigo"] == "P-002"
    assert first["estado"] == "open"


def test_two_projects_cannot_share_a_code(tenant):
    _project(tenant, "Website", code="WEB")
    response = tenant.post("/api/v1/projects/", {"name": "Outro", "code": "web"})
    assert response.status_code == 409


def test_a_project_without_a_name_is_refused(tenant):
    assert tenant.post("/api/v1/projects/", {"name": "   "}).status_code == 400


def test_a_project_carries_its_plan_and_its_client(tenant):
    project = _project(tenant, "Loja online", budget=4000, contract_value=6150,
                       entity_name="Frutas do Algarve Lda", started_on="2026-07-01")

    assert project["orcamento"] == 4000.0
    assert project["valor_contratado"] == 6150.0
    assert project["cliente"] == "Frutas do Algarve Lda"


def test_a_project_can_be_corrected_and_closed(tenant):
    project = _project(tenant)
    updated = tenant.patch(f"/api/v1/projects/{project['id']}",
                           {"budget": 5000, "status": "closed"}).json()

    assert updated["orcamento"] == 5000.0
    assert updated["estado"] == "closed"
    assert tenant.get("/api/v1/projects/?include_closed=false").json() == []


def test_an_unused_project_is_deleted(tenant):
    project = _project(tenant)
    result = tenant.delete(f"/api/v1/projects/{project['id']}").json()
    assert result["status"] == "success"
    assert tenant.get("/api/v1/projects/").json() == []


def test_a_project_with_history_is_closed_instead_of_deleted(tenant):
    project = _project(tenant)
    _book_on(tenant, project, amount=250.0, date="2026-06-01")

    result = tenant.delete(f"/api/v1/projects/{project['id']}").json()
    # Deleting would orphan the documents' history; closing loses nothing.
    assert result["status"] == "closed"
    assert result["documentos"] == 1
    assert tenant.get(f"/api/v1/projects/{project['id']}").json()["estado"] == "closed"


def test_an_invalid_status_is_refused(tenant):
    project = _project(tenant)
    assert tenant.patch(f"/api/v1/projects/{project['id']}",
                        {"status": "talvez"}).status_code == 400


# ---------------------------------------------------------------------------
# The margin
# ---------------------------------------------------------------------------

def test_the_margin_is_net_of_vat_like_the_income_statement(tenant):
    project = _project(tenant, "Website Câmara")
    # 6 150 € faturados e 2 460 € de custos, ambos a 23%: 5 000 − 2 000.
    _book_on(tenant, project, "income", 6150.00, date="2026-05-06", vat_rate=23)
    _book_on(tenant, project, "expense", 2460.00, date="2026-05-20", vat_rate=23)

    row = _row(_profit(tenant), "Website Câmara")
    assert row["rendimentos"] == 5000.0
    assert row["gastos"] == 2000.0
    assert row["margem"] == 3000.0
    assert row["margem_pct"] == 60.0


def test_the_totals_agree_with_the_income_statement(tenant):
    project = _project(tenant)
    _book_on(tenant, project, "income", 4920.00, date="2026-09-04", vat_rate=23)
    _book_on(tenant, project, "expense", 1230.00, date="2026-09-08", vat_rate=23)

    profit = _profit(tenant, "2026-09-01", "2026-10-01")
    dre = tenant.get("/api/v1/reports/income-statement?period=2026-09").json()
    subtotals = {r["key"]: r["amount"] for r in dre["subtotais"]}

    assert profit["totais"]["rendimentos"] == subtotals["total_rendimentos"] == 4000.0
    assert profit["totais"]["gastos"] == subtotals["total_gastos"] == 1000.0
    assert profit["totais"]["margem"] == subtotals["resultado_liquido"]


def test_a_losing_project_is_named_first(tenant):
    good = _project(tenant, "Projeto bom")
    bad = _project(tenant, "Projeto mau")
    _book_on(tenant, good, "income", 5000.00, date="2026-03-01", vat_rate=0)
    _book_on(tenant, bad, "income", 1000.00, date="2026-03-01", vat_rate=0)
    _book_on(tenant, bad, "expense", 2500.00, date="2026-03-05", vat_rate=0)

    data = _profit(tenant)
    assert data["projetos"][0]["projeto"] == "Projeto mau"
    assert data["projetos"][0]["margem"] == -1500.0
    assert "a perder dinheiro" in data["mensagem"]
    assert "Projeto mau" in data["mensagem"]


def test_going_over_the_project_budget_is_flagged(tenant):
    project = _project(tenant, "Obra", budget=1000)
    _book_on(tenant, project, "expense", 1400.00, date="2026-04-01", vat_rate=0)

    row = _row(_profit(tenant), "Obra")
    assert row["acima_do_orcamento"] is True
    assert row["orcamento_usado_pct"] == 140.0
    assert "passou o orçamento" in _profit(tenant)["mensagem"]


def test_a_project_without_a_budget_cannot_be_over_it(tenant):
    project = _project(tenant, "Sem plano")
    _book_on(tenant, project, "expense", 900.00, date="2026-04-01", vat_rate=0)

    row = _row(_profit(tenant), "Sem plano")
    assert row["orcamento_usado_pct"] is None
    assert row["acima_do_orcamento"] is False


def test_documents_outside_the_window_do_not_count(tenant):
    project = _project(tenant, "Anual")
    _book_on(tenant, project, "expense", 100.00, date="2025-12-31", vat_rate=0)
    _book_on(tenant, project, "expense", 200.00, date="2026-06-01", vat_rate=0)

    row = _row(_profit(tenant, "2026-01-01", "2027-01-01"), "Anual")
    assert row["gastos"] == 200.0


# ---------------------------------------------------------------------------
# What belongs to no project
# ---------------------------------------------------------------------------

def test_unassigned_documents_are_a_row_not_a_rounding_error(tenant):
    project = _project(tenant, "Com projeto")
    _book_on(tenant, project, "income", 1000.00, date="2026-05-01", vat_rate=0)
    # Booked with no cost centre at all.
    tenant.book("expense", 400.00, date="2026-05-02", vat_rate=0)

    data = _profit(tenant)
    unassigned = next(p for p in data["projetos"] if p["sem_projeto"])

    assert unassigned["projeto"] == "Sem projeto"
    assert unassigned["gastos"] == 400.0
    assert data["nao_atribuido"]["documentos"] == 1
    assert "sem projeto" in data["mensagem"]
    # And it still counts in the company totals: nothing is dropped.
    assert data["totais"]["gastos"] == 400.0


def test_a_free_text_cost_centre_keeps_its_own_row(tenant):
    # Documents booked before projects were managed carry only a name.
    tenant.book("expense", 300.00, date="2026-05-01", vat_rate=0,
                cost_center_name="Sede")

    row = _row(_profit(tenant), "Sede")
    assert row["gastos"] == 300.0
    assert row["por_criar"] is True
    assert row["sem_projeto"] is False


def test_with_nothing_attributed_the_report_says_so(tenant):
    tenant.book("expense", 100.00, date="2026-05-01", vat_rate=0)
    data = _profit(tenant)
    assert "Nenhum documento está atribuído" in data["mensagem"]


# ---------------------------------------------------------------------------
# One project in detail
# ---------------------------------------------------------------------------

def test_a_project_statement_lists_its_documents(tenant):
    project = _project(tenant, "Loja online", budget=2000)
    _book_on(tenant, project, "income", 6150.00, date="2026-07-08", vat_rate=23,
             description="Adjudicação")
    _book_on(tenant, project, "expense", 1230.00, date="2026-07-20", vat_rate=23,
             description="Subcontratação")

    data = tenant.get(f"/api/v1/projects/{project['id']}/statement").json()

    assert [m["descricao"] for m in data["movimentos"]] == ["Adjudicação", "Subcontratação"]
    assert data["rendimentos"] == 5000.0
    assert data["gastos"] == 1000.0
    assert data["margem"] == 4000.0
    assert data["orcamento_usado_pct"] == 50.0


def test_a_cancelled_document_leaves_the_project(tenant):
    project = _project(tenant, "Projeto")
    kept = _book_on(tenant, project, "expense", 100.00, date="2026-05-01", vat_rate=0)
    dropped = _book_on(tenant, project, "expense", 900.00, date="2026-05-02", vat_rate=0)
    tenant.patch(f"/api/v1/transactions/{dropped['id']}", {"status": "cancelled"})

    data = tenant.get(f"/api/v1/projects/{project['id']}/statement").json()
    assert [m["id"] for m in data["movimentos"]] == [kept["id"]]
    assert data["gastos"] == 100.0


# ---------------------------------------------------------------------------
# Isolation
# ---------------------------------------------------------------------------

def test_projects_are_scoped_to_the_active_company(tenant, other_tenant):
    _project(other_tenant, "Projeto alheio")
    assert tenant.get("/api/v1/projects/").json() == []


def test_another_company_project_cannot_be_read_or_changed(tenant, other_tenant):
    theirs = _project(other_tenant, "Projeto alheio")
    assert tenant.get(f"/api/v1/projects/{theirs['id']}").status_code == 404
    assert tenant.patch(f"/api/v1/projects/{theirs['id']}", {"name": "Meu"}).status_code == 404
    assert tenant.delete(f"/api/v1/projects/{theirs['id']}").status_code == 404
