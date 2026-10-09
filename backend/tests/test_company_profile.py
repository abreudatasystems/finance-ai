"""A ficha da empresa: o que se pede ao criá-la e para que serve."""


def _new_company(tenant, **extra):
    response = tenant.post("/api/v1/companies/", {"name": "Ficha Completa Lda", **extra})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_full_profile_is_kept(tenant):
    company = _new_company(
        tenant,
        nif="500000000", trade_name="Ficha", legal_form="Lda", cae="62010",
        share_capital=5000, incorporation_date="2020-03-01",
        address="Rua das Flores 10", postal_code="4050-262", city="Porto",
        email="geral@ficha.pt", phone="+351 220 000 000", website="ficha.pt",
        irc_regime="simplificado", niss="20000000000", fiscal_year_start="01",
        accountant_name="Ana Contas", accountant_nif="123456789", accountant_email="ana@contas.pt",
        customer_terms_days=30, supplier_terms_days=45,
    )
    listed = next(c for c in tenant.get("/api/v1/companies/").json() if c["id"] == company["id"])
    assert listed["trade_name"] == "Ficha"
    assert listed["share_capital"] == 5000.0
    assert listed["city"] == "Porto"
    assert listed["irc_regime"] == "simplificado"
    assert listed["accountant_email"] == "ana@contas.pt"
    assert listed["customer_terms_days"] == 30
    assert listed["supplier_terms_days"] == 45


def test_the_bank_account_and_opening_balance_are_created(tenant):
    company = _new_company(tenant, bank_name="CGD", iban="pt50 0035 0000 0000 0000 0000 0", opening_balance=12500.5)
    accounts = tenant.client.get("/api/v1/bank-accounts/", headers=tenant.scoped(company["id"])).json()
    assert len(accounts) == 1
    assert accounts[0]["bank_name"] == "CGD"
    assert accounts[0]["iban"] == "PT50003500000000000000000"
    assert accounts[0]["opening_balance"] == 12500.5
    assert accounts[0]["is_default"] is True


def test_invalid_profile_values_are_refused(tenant):
    assert tenant.post("/api/v1/companies/", {"name": "X1", "irc_regime": "banana"}).status_code == 400
    assert tenant.post("/api/v1/companies/", {"name": "X2", "customer_terms_days": 400}).status_code == 400
    assert tenant.post("/api/v1/companies/", {"name": "X3", "fiscal_year_start": "13"}).status_code == 400


def test_payment_terms_set_the_due_date(tenant):
    tenant.patch(f"/api/v1/companies/{tenant.company_id}", {"supplier_terms_days": 30, "customer_terms_days": 15})

    expense = tenant.book("expense", 100.0, date="2026-08-12")
    assert expense["due_date"] == "2026-09-11"

    income = tenant.book("income", 100.0, date="2026-08-12", category=tenant.category("income"))
    assert income["due_date"] == "2026-08-27"

    explicit = tenant.book("expense", 100.0, date="2026-08-12", due_date="2026-08-20")
    assert explicit["due_date"] == "2026-08-20"


def test_without_terms_a_document_is_due_on_its_date(tenant):
    assert tenant.book("expense", 100.0, date="2026-08-12")["due_date"] == "2026-08-12"
