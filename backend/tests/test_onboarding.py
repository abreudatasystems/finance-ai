"""Primeiros passos, and the empty states that used to lie.

The tests that matter here are the negative ones: a company with nothing in it
must not be told everything is fine on any screen.
"""


def _steps(tenant) -> dict:
    data = tenant.get("/api/v1/onboarding/").json()
    return {s["chave"]: s for s in data["passos"]}


# ---------------------------------------------------------------------------
# The checklist
# ---------------------------------------------------------------------------

def test_a_new_company_is_not_ready_and_says_why(tenant):
    data = tenant.get("/api/v1/onboarding/").json()

    assert data["completo"] is False
    assert data["pronto"] is False              # an essential step is open
    assert data["proximo"]["chave"] == "saldo_inicial"
    # The message names the step to start with, in the step's own words.
    assert data["proximo"]["titulo"].lower() in data["mensagem"].lower()
    assert "não refletem" in data["mensagem"]


def test_the_opening_balance_is_the_first_step_and_zero_does_not_count(tenant):
    # Every company is given one account at a balance of zero; that is not an
    # answer, it is the absence of one.
    assert _steps(tenant)["saldo_inicial"]["feito"] is False

    account = tenant.get("/api/v1/bank-accounts/").json()[0]
    assert account["opening_balance"] == 0.0

    response = tenant.patch(f"/api/v1/bank-accounts/{account['id']}",
                            {"opening_balance": 4200.00})
    assert response.status_code == 200
    assert response.json()["opening_balance"] == 4200.0

    assert _steps(tenant)["saldo_inicial"]["feito"] is True


def test_booking_a_paid_document_also_answers_the_balance_question(tenant):
    # A company that has real movements has told us what we needed to know.
    tenant.book("expense", 120, paid=True)
    assert _steps(tenant)["saldo_inicial"]["feito"] is True


def test_steps_tick_off_as_the_company_is_used(tenant):
    before = _steps(tenant)
    assert before["primeiro_documento"]["feito"] is False
    assert before["primeiro_pagamento"]["feito"] is False

    tenant.book("expense", 300)                       # a document, unpaid
    mid = _steps(tenant)
    assert mid["primeiro_documento"]["feito"] is True
    assert mid["primeiro_pagamento"]["feito"] is False

    trx = tenant.book("expense", 90, paid=True)
    assert trx["payment_status"] == "paid"
    assert _steps(tenant)["primeiro_pagamento"]["feito"] is True


def test_the_vat_step_does_not_tick_itself_on_a_placeholder_nif(tenant):
    # A company is created with a placeholder NIF. Having one is not the same
    # as someone having confirmed it.
    assert _steps(tenant)["regime_iva"]["feito"] is False

    company = tenant.get("/api/v1/companies/").json()[0]
    response = tenant.patch(f"/api/v1/companies/{company['id']}", {"nif": "PT509876543"})
    assert response.status_code == 200

    assert _steps(tenant)["regime_iva"]["feito"] is True


def test_every_step_says_why_it_matters(tenant):
    for step in tenant.get("/api/v1/onboarding/").json()["passos"]:
        assert step["porque"], f"{step['chave']} não explica porquê"
        assert step["onde"].startswith("/")


def test_progress_counts_what_is_done(tenant):
    start = tenant.get("/api/v1/onboarding/").json()
    tenant.book("income", 500)
    after = tenant.get("/api/v1/onboarding/").json()
    assert after["concluidos"] > start["concluidos"]
    assert after["progresso"] > start["progresso"]


def test_onboarding_is_scoped_to_the_active_company(tenant, other_tenant):
    other_tenant.book("income", 900, paid=True)
    assert _steps(tenant)["primeiro_documento"]["feito"] is False


# ---------------------------------------------------------------------------
# Empty states: the three screens that congratulated an empty company
# ---------------------------------------------------------------------------

def test_the_forecast_does_not_reassure_an_empty_company(tenant):
    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=4").json()

    assert data["resumo"]["sem_dados"] is True
    assert "Sem apertos" not in data["resumo"]["mensagem"]
    assert "Ainda não há dados" in data["resumo"]["mensagem"]


def test_the_forecast_speaks_normally_once_there_is_something_to_project(tenant):
    account = tenant.get("/api/v1/bank-accounts/").json()[0]
    tenant.patch(f"/api/v1/bank-accounts/{account['id']}", {"opening_balance": 8000})

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=4").json()
    assert data["resumo"]["sem_dados"] is False
    assert data["saldo_inicial"] == 8000.0


def test_collections_does_not_congratulate_an_empty_company(tenant):
    data = tenant.get("/api/v1/collections/").json()

    assert data["sem_dados"] is True
    assert "Continue assim" not in data["mensagem"]
    assert "Ainda não há documentos" in data["mensagem"]


def test_collections_speaks_normally_once_there_are_documents(tenant):
    tenant.book("income", 400, date="2026-09-01", due_date="2026-12-31")
    data = tenant.get("/api/v1/collections/").json()
    assert data["sem_dados"] is False
    assert "Nada vencido" in data["mensagem"]


def test_alerts_are_not_all_clear_on_an_empty_company(tenant):
    resumo = tenant.get("/api/v1/alerts/").json()["resumo"]

    assert resumo["sem_dados"] is True
    assert resumo["tudo_em_dia"] is False       # nothing was checked
    assert resumo["total"] == 0


def test_alerts_are_all_clear_once_there_is_something_to_check(tenant):
    tenant.book("expense", 50, date="2026-09-01", due_date="2099-12-31", paid=True)
    resumo = tenant.get("/api/v1/alerts/").json()["resumo"]
    assert resumo["sem_dados"] is False


# ---------------------------------------------------------------------------
# The bank account edit the first step depends on
# ---------------------------------------------------------------------------

def test_only_one_account_stays_the_default(tenant):
    first = tenant.get("/api/v1/bank-accounts/").json()[0]
    created = tenant.post("/api/v1/bank-accounts/", {
        "name": "Conta Poupança", "opening_balance": 1000, "is_default": True,
    }).json()

    tenant.patch(f"/api/v1/bank-accounts/{first['id']}", {"is_default": True})
    accounts = tenant.get("/api/v1/bank-accounts/").json()
    defaults = [a["id"] for a in accounts if a["is_default"]]
    assert defaults == [first["id"]]
    assert created["id"] in [a["id"] for a in accounts]


def test_an_account_cannot_be_renamed_to_nothing(tenant):
    account = tenant.get("/api/v1/bank-accounts/").json()[0]
    assert tenant.patch(f"/api/v1/bank-accounts/{account['id']}", {"name": "  "}).status_code == 400


def test_another_company_account_cannot_be_touched(tenant, other_tenant):
    theirs = other_tenant.get("/api/v1/bank-accounts/").json()[0]
    response = tenant.patch(f"/api/v1/bank-accounts/{theirs['id']}", {"opening_balance": 1})
    assert response.status_code == 404
