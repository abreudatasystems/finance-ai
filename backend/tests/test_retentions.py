"""Retenção na fonte.

Three things have to be right, and each was a way the product was wrong:

* the withholding is computed on the **base**, never on the gross;
* it works in **both directions** — the company withholds on what it pays and
  is withheld from on what it invoices;
* what settles is the **payable**, so a document with a retention closes at
  less than its total instead of staying forever half paid.
"""


def _book(tenant, kind="expense", amount=184.50, *, vat_rate=23,
          code=None, rate=None, when="2026-09-10", **extra):
    payload = {"retention_code": code}
    if rate is not None:
        payload["retention_rate"] = rate
    return tenant.book(kind, amount, date=when, vat_rate=vat_rate, **payload, **extra)


# ---------------------------------------------------------------------------
# The arithmetic
# ---------------------------------------------------------------------------

def test_the_withholding_is_computed_on_the_base_not_the_gross(tenant):
    # 150 € + 23% IVA = 184,50 €. A retenção é 25% de 150 €, não de 184,50 €.
    trx = _book(tenant, code="irs_b_25")

    assert trx["net_amount"] == 150.0
    assert trx["retention_amount"] == 37.50
    assert trx["retention_rate"] == 25.0
    assert trx["payable_amount"] == 147.00
    # Sobre o bruto daria 46,13 € — o erro que se estava a cometer.
    assert trx["retention_amount"] != 46.13


def test_the_obligation_is_what_is_payable(tenant):
    trx = _book(tenant, code="irs_b_25")
    # O que fica em aberto é o que vai sair do banco, não o total do documento.
    assert trx["outstanding_amount"] == 147.00


def test_a_document_with_retention_settles_in_full_at_the_payable(tenant):
    trx = _book(tenant, code="irs_b_25")

    response = tenant.post(f"/api/v1/transactions/{trx['id']}/payments",
                           {"payment_date": "2026-09-15"})
    assert response.status_code == 201, response.text
    result = response.json()

    # Liquidar por omissão paga 147 €, e o documento fica fechado.
    assert result["payment"]["amount"] == 147.00
    assert result["transaction"]["payment_status"] == "paid"
    assert result["transaction"]["outstanding_amount"] == 0.0


def test_paying_the_gross_is_refused(tenant):
    trx = _book(tenant, code="irs_b_25")
    response = tenant.post(f"/api/v1/transactions/{trx['id']}/payments",
                           {"payment_date": "2026-09-15", "amount": 184.50})
    # Os 37,50 € vão para o Estado, não para o fornecedor.
    assert response.status_code == 400
    assert "excede" in response.json()["detail"]


def test_no_retention_leaves_the_payable_equal_to_the_total(tenant):
    trx = _book(tenant, amount=123.00)
    assert trx["retention_amount"] == 0.0
    assert trx["payable_amount"] == 123.00
    assert trx["outstanding_amount"] == 123.00


def test_the_exempt_code_withholds_nothing(tenant):
    trx = _book(tenant, code="isento")
    assert trx["retention_amount"] == 0.0
    assert trx["payable_amount"] == 184.50


def test_an_explicit_rate_overrides_the_catalogue(tenant):
    # A empresa foi informada de que este fornecedor tem dispensa este ano.
    trx = _book(tenant, code="irs_b_25", rate=0)
    assert trx["retention_amount"] == 0.0
    assert trx["payable_amount"] == 184.50

    other = _book(tenant, code="irs_b_25", rate=11.5)
    assert other["retention_amount"] == 17.25       # 11,5% de 150 €


def test_the_rates_in_the_catalogue_are_applied(tenant):
    cases = {
        "irs_b_25": 37.50,      # 25% de 150
        "irs_b_235": 35.25,     # 23,5%
        "irs_b_165": 24.75,     # 16,5%
        "irs_b_115": 17.25,     # 11,5%
        "irs_e_28": 42.00,      # 28%
    }
    for code, expected in cases.items():
        trx = _book(tenant, code=code)
        assert trx["retention_amount"] == expected, code


def test_a_retention_larger_than_the_document_is_refused(tenant):
    # Uma taxa impossível não deve produzir um pagável negativo em silêncio.
    response = tenant.client.post(
        "/api/v1/transactions/", headers=tenant.headers,
        json={"date": "2026-09-10", "type": "expense", "description": "Erro",
              "entity_name": "X", "category_id": tenant.category("expense")["id"],
              "category_name": tenant.category("expense")["name"],
              "amount": 100.0, "vat_rate": 0, "retention_code": "irs_b_25",
              "retention_rate": 250},
    )
    assert response.status_code == 400
    assert "superior ao total" in response.json()["detail"]


# ---------------------------------------------------------------------------
# The other direction: what clients withhold from the company
# ---------------------------------------------------------------------------

def test_an_invoice_to_a_client_is_received_net_of_the_retention(tenant):
    # A empresa fatura 1 000 € + IVA; o cliente retém 250 € e transfere 980 €.
    trx = _book(tenant, "income", amount=1230.00, code="irs_b_25")

    assert trx["net_amount"] == 1000.0
    assert trx["retention_amount"] == 250.00
    assert trx["payable_amount"] == 980.00
    assert trx["outstanding_amount"] == 980.00


def test_the_two_directions_are_never_netted_against_each_other(tenant):
    _book(tenant, "expense", amount=184.50, code="irs_b_25")     # retém 37,50
    _book(tenant, "income", amount=1230.00, code="irs_b_25")     # sofre 250,00

    position = tenant.get("/api/v1/retentions/position?period=2026-09").json()

    assert position["retido_a_terceiros"]["total"] == 37.50
    assert position["retido_por_terceiros"]["total"] == 250.00
    # O que há a entregar é só o que a empresa reteve. O resto é crédito dela.
    assert position["entrega"]["valor"] == 37.50


# ---------------------------------------------------------------------------
# Correcting a document
# ---------------------------------------------------------------------------

def test_correcting_the_total_recomputes_the_retention(tenant):
    trx = _book(tenant, code="irs_b_25")
    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}", {"amount": 369.00}).json()

    assert updated["net_amount"] == 300.0
    assert updated["retention_amount"] == 75.00      # 25% de 300, não os 37,50 antigos
    assert updated["payable_amount"] == 294.00


def test_removing_the_retention_restores_the_full_payable(tenant):
    trx = _book(tenant, code="irs_b_25")
    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}",
                           {"retention_code": "isento"}).json()
    assert updated["retention_amount"] == 0.0
    assert updated["payable_amount"] == 184.50
    assert updated["outstanding_amount"] == 184.50


def test_adding_the_retention_afterwards_lowers_what_is_owed(tenant):
    trx = _book(tenant)
    assert trx["payable_amount"] == 184.50

    updated = tenant.patch(f"/api/v1/transactions/{trx['id']}",
                           {"retention_code": "irs_b_25"}).json()
    assert updated["retention_amount"] == 37.50
    assert updated["outstanding_amount"] == 147.00


def test_installments_split_what_is_payable(tenant):
    trx = _book(tenant, code="irs_b_25")
    response = tenant.post(f"/api/v1/transactions/{trx['id']}/installments",
                           {"count": 3, "first_due_date": "2026-10-01"})
    assert response.status_code == 201, response.text
    total = sum(row["amount"] for row in response.json())
    # 147 €, não 184,50 €: um plano sobre o bruto nunca fecharia.
    assert round(total, 2) == 147.00


# ---------------------------------------------------------------------------
# The position and the deadline
# ---------------------------------------------------------------------------

def test_the_delivery_is_due_on_the_twentieth_of_the_next_month(tenant):
    _book(tenant, code="irs_b_25", when="2026-09-10")
    position = tenant.get("/api/v1/retentions/position?period=2026-09&today=2026-09-30").json()

    assert position["entrega"]["ate"] == "2026-10-20"
    assert position["entrega"]["em_atraso"] is False
    assert "a entregar ao Estado até 2026-10-20" in position["mensagem"]


def test_a_missed_delivery_is_flagged_as_late(tenant):
    _book(tenant, code="irs_b_25", when="2026-07-10")
    position = tenant.get("/api/v1/retentions/position?period=2026-07&today=2026-09-01").json()

    assert position["entrega"]["em_atraso"] is True
    assert "o prazo era 2026-08-20" in position["mensagem"]


def test_the_position_groups_by_rate_the_way_it_is_declared(tenant):
    _book(tenant, code="irs_b_25", when="2026-09-05")
    _book(tenant, code="irs_b_25", when="2026-09-06")
    _book(tenant, code="irs_b_115", when="2026-09-07")

    position = tenant.get("/api/v1/retentions/position?period=2026-09").json()
    groups = {g["codigo"]: g for g in position["retido_a_terceiros"]["por_taxa"]}

    assert groups["irs_b_25"]["retido"] == 75.00
    assert groups["irs_b_25"]["documentos"] == 2
    assert groups["irs_b_115"]["retido"] == 17.25
    assert groups["irs_b_25"]["base_legal"].startswith("art. 101")


def test_cancelled_documents_owe_nothing(tenant):
    trx = _book(tenant, code="irs_b_25")
    tenant.patch(f"/api/v1/transactions/{trx['id']}", {"status": "cancelled"})
    position = tenant.get("/api/v1/retentions/position?period=2026-09").json()
    assert position["entrega"]["valor"] == 0.0
    assert "Nenhum documento" in position["mensagem"]


def test_every_month_still_owing_is_listed_oldest_first(tenant):
    _book(tenant, code="irs_b_25", when="2026-07-10")
    _book(tenant, code="irs_b_115", when="2026-08-10")

    data = tenant.get("/api/v1/retentions/pending?today=2026-09-15").json()
    periods = [row["periodo"] for row in data["entregas"]]

    assert periods == ["2026-07", "2026-08"]
    assert data["total"] == 54.75          # 37,50 + 17,25
    # Só julho está em atraso: a de agosto vence a 20 de setembro, daqui a 5 dias.
    assert data["em_atraso"] == 37.50


# ---------------------------------------------------------------------------
# Separating the documents that carry a retention
# ---------------------------------------------------------------------------

def test_retained_documents_can_be_looked_at_as_their_own_set(tenant):
    kept = _book(tenant, code="irs_b_25", when="2026-09-05")
    _book(tenant, when="2026-09-06")                       # sem retenção
    invoiced = _book(tenant, "income", amount=1230.00, code="irs_b_25", when="2026-09-07")

    every = tenant.get("/api/v1/retentions/documents").json()
    assert {d["id"] for d in every["documentos"]} == {kept["id"], invoiced["id"]}

    only_expense = tenant.get("/api/v1/retentions/documents?side=expense").json()
    assert [d["id"] for d in only_expense["documentos"]] == [kept["id"]]
    assert only_expense["total_retido"] == 37.50


def test_the_annual_view_groups_by_counterparty(tenant):
    _book(tenant, code="irs_b_25", when="2026-03-10", entity_name="Contabilista Silva")
    _book(tenant, code="irs_b_25", when="2026-06-10", entity_name="Contabilista Silva")
    _book(tenant, code="irs_b_115", when="2026-07-10", entity_name="Designer Costa")

    data = tenant.get("/api/v1/retentions/by-entity?year=2026&side=expense").json()
    worst = data["entidades"][0]

    assert worst["entidade"] == "Contabilista Silva"
    assert worst["retido"] == 75.00
    assert worst["base"] == 300.00
    assert worst["documentos"] == 2
    assert data["total"] == 92.25


# ---------------------------------------------------------------------------
# The counterparty default
# ---------------------------------------------------------------------------

def test_a_counterparty_default_is_proposed_on_new_documents(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Contabilista Silva", "nif": "PT123456789", "is_supplier": True,
    }).json()

    response = tenant.put(f"/api/v1/retentions/entities/{entity['id']}/default",
                          {"retention_code": "irs_b_25"})
    assert response.status_code == 200
    assert response.json()["taxa"] == 25.0

    # Um documento que não diz nada herda a retenção habitual do fornecedor.
    trx = tenant.book("expense", 184.50, date="2026-09-10", vat_rate=23,
                      entity_id=entity["id"], entity_name=entity["name"])
    assert trx["retention_code"] == "irs_b_25"
    assert trx["retention_amount"] == 37.50


def test_a_document_can_say_no_against_the_counterparty_default(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Contabilista Silva", "nif": "PT123456789", "is_supplier": True,
    }).json()
    tenant.put(f"/api/v1/retentions/entities/{entity['id']}/default",
               {"retention_code": "irs_b_25"})

    trx = tenant.book("expense", 184.50, date="2026-09-10", vat_rate=23,
                      entity_id=entity["id"], entity_name=entity["name"],
                      retention_code="isento")
    assert trx["retention_amount"] == 0.0


def test_an_unknown_retention_code_is_refused(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "X", "nif": "PT111222333", "is_supplier": True,
    }).json()
    response = tenant.put(f"/api/v1/retentions/entities/{entity['id']}/default",
                          {"retention_code": "inventado"})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# What it does to the cash forecast and the alerts
# ---------------------------------------------------------------------------

def test_the_forecast_carries_the_delivery_to_the_state(tenant):
    _book(tenant, code="irs_b_25", when="2026-09-10")

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=13&today=2026-09-15").json()
    movement = next(
        m for week in data["semanas"] for m in week["movimentos"]
        if m["origin"] == "retenção"
    )
    assert movement["date"] == "2026-10-20"
    assert movement["amount"] == 37.50
    assert movement["kind"] == "out"


def test_the_forecast_moves_the_payable_not_the_gross(tenant):
    _book(tenant, "income", amount=1230.00, code="irs_b_25",
          when="2026-09-10", due_date="2026-09-30")

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=13&today=2026-09-15").json()
    incoming = [m for week in data["semanas"] for m in week["movimentos"]
                if m["kind"] == "in" and m["origin"] == "documento"]
    # Entra o que o cliente transfere, não o que foi faturado.
    assert [m["amount"] for m in incoming] == [980.00]


def test_a_late_delivery_raises_an_alert(tenant):
    _book(tenant, code="irs_b_25", when="2026-07-10")
    payload = tenant.get("/api/v1/alerts/?today=2026-09-01").json()
    alert = next(a for a in payload["alertas"] if a["kind"] == "retencoes_em_atraso")

    assert alert["severity"] == "danger"
    assert alert["amount"] == 37.50
    assert alert["action"] == "/fiscal/retentions"


def test_no_retentions_means_no_alert(tenant):
    _book(tenant, when="2026-07-10")
    payload = tenant.get("/api/v1/alerts/?today=2026-09-01").json()
    assert not [a for a in payload["alertas"] if a["kind"].startswith("retencoes")]


# ---------------------------------------------------------------------------
# The result is untouched, and companies stay apart
# ---------------------------------------------------------------------------

def test_the_retention_is_not_a_cost_and_does_not_change_the_result(tenant):
    _book(tenant, code="irs_b_25", when="2026-09-10")

    dre = tenant.get("/api/v1/reports/income-statement?period=2026-09").json()
    subtotals = {row["key"]: row["amount"] for row in dre["subtotais"]}
    # O gasto continua a ser os 150 € de base: a retenção é dinheiro do
    # fornecedor entregue por conta dele, não um custo da empresa.
    assert subtotals["total_gastos"] == 150.0


def test_retentions_are_scoped_to_the_active_company(tenant, other_tenant):
    _book(other_tenant, code="irs_b_25", when="2026-09-10")
    position = tenant.get("/api/v1/retentions/position?period=2026-09").json()
    assert position["entrega"]["valor"] == 0.0


def test_the_catalogue_only_offers_what_fits_the_side(tenant):
    income = tenant.get("/api/v1/retentions/types?side=income").json()
    codes = {t["codigo"] for t in income["tipos"]}
    # Rendas e capitais só existem do lado das despesas.
    assert "irs_f_25" not in codes
    assert "irs_b_25" in codes


def test_an_unparseable_period_is_refused(tenant):
    assert tenant.get("/api/v1/retentions/position?period=setembro").status_code == 400
