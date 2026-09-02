"""Cobranças: aging buckets, learned payment behaviour, and the forecast that
finally uses it.

The behaviour tests are the ones that matter: a company that pays 40 days late
every time should not be forecast as paying on time, and a company with one
late invoice should not be branded for it.
"""

from datetime import date, timedelta


def _pay(tenant, trx_id: str, when: str, amount: float = None):
    payload = {"payment_date": when}
    if amount is not None:
        payload["amount"] = amount
    response = tenant.post(f"/api/v1/transactions/{trx_id}/payments", payload)
    assert response.status_code == 201, response.text
    return response.json()


def _invoice(tenant, *, entity: str, amount: float, issued: str, due: str,
             kind: str = "income"):
    return tenant.book(kind, amount, date=issued, due_date=due, entity_name=entity,
                       description=f"Fatura {entity}")


# ---------------------------------------------------------------------------
# Aging
# ---------------------------------------------------------------------------

def test_aging_splits_by_how_late_the_document_is(tenant):
    today = date(2026, 9, 1)
    # Due in the future, 10 days late, 45 days late, 100 days late.
    for amount, due in [(100, "2026-09-20"), (200, "2026-08-22"),
                        (300, "2026-07-18"), (400, "2026-05-20")]:
        _invoice(tenant, entity="Cliente A", amount=amount,
                 issued="2026-05-01", due=due)

    data = tenant.get(f"/api/v1/collections/aging?kind=income&today={today}").json()
    buckets = {b["chave"]: b["total"] for b in data["escaloes"]}

    assert buckets["a_vencer"] == 100.0
    assert buckets["d1_30"] == 200.0
    assert buckets["d31_60"] == 300.0
    assert buckets["d90_mais"] == 400.0
    assert data["total"] == 1000.0
    assert data["vencido"] == 900.0
    assert data["peso_vencido"] == 90.0


def test_aging_ignores_paid_and_cancelled_documents(tenant):
    open_one = _invoice(tenant, entity="Cliente B", amount=500,
                        issued="2026-08-01", due="2026-08-10")
    settled = _invoice(tenant, entity="Cliente B", amount=900,
                       issued="2026-08-01", due="2026-08-10")
    _pay(tenant, settled["id"], "2026-08-12")

    cancelled = _invoice(tenant, entity="Cliente B", amount=700,
                         issued="2026-08-01", due="2026-08-10")
    tenant.patch(f"/api/v1/transactions/{cancelled['id']}", {"status": "cancelled"})

    data = tenant.get("/api/v1/collections/aging?kind=income&today=2026-09-01").json()
    assert data["total"] == 500.0
    assert [d["id"] for d in data["documentos"]] == [open_one["id"]]


def test_aging_groups_by_entity_and_names_the_oldest(tenant):
    _invoice(tenant, entity="Devedor Antigo", amount=1000,
             issued="2026-04-01", due="2026-04-30")
    _invoice(tenant, entity="Devedor Antigo", amount=500,
             issued="2026-08-01", due="2026-08-25")
    _invoice(tenant, entity="Cliente Pontual", amount=200,
             issued="2026-08-20", due="2026-09-30")

    data = tenant.get("/api/v1/collections/aging?kind=income&today=2026-09-01").json()
    worst = data["entidades"][0]

    assert worst["entidade"] == "Devedor Antigo"
    assert worst["total"] == 1500.0
    assert worst["vencido"] == 1500.0          # both are past due on 1 Sep
    assert worst["mais_antigo"] == (date(2026, 9, 1) - date(2026, 4, 30)).days
    assert worst["documentos"] == 2


def test_aging_covers_payables_too(tenant):
    tenant.book("expense", 800, date="2026-06-01", due_date="2026-06-30",
                entity_name="Fornecedor Atrasado")
    data = tenant.get("/api/v1/collections/aging?kind=expense&today=2026-09-01").json()
    assert data["tipo"] == "expense"
    assert data["vencido"] == 800.0


def test_aging_rejects_an_unknown_kind(tenant):
    assert tenant.get("/api/v1/collections/aging?kind=whatever").status_code == 400


# ---------------------------------------------------------------------------
# Behaviour
# ---------------------------------------------------------------------------

def test_behaviour_learns_the_habitual_delay(tenant):
    # Three invoices, each settled 30 days after the due date.
    for issued, due, paid in [("2026-03-01", "2026-03-31", "2026-04-30"),
                              ("2026-04-01", "2026-04-30", "2026-05-30"),
                              ("2026-05-01", "2026-05-31", "2026-06-30")]:
        trx = _invoice(tenant, entity="Cliente Lento", amount=1000,
                       issued=issued, due=due)
        _pay(tenant, trx["id"], paid)

    data = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in data["entidades"] if e["entity_name"] == "Cliente Lento")

    assert entry["atraso_medio"] == 30
    assert entry["documentos"] == 3
    assert entry["fiavel"] is True
    assert entry["pontualidade"] == 0


def test_behaviour_weights_the_average_by_amount(tenant):
    # 10 000 € 60 days late, 100 € on time: the average must lean heavily late.
    big = _invoice(tenant, entity="Cliente Misto", amount=10000,
                   issued="2026-03-01", due="2026-03-31")
    _pay(tenant, big["id"], "2026-05-30")
    small = _invoice(tenant, entity="Cliente Misto", amount=100,
                     issued="2026-04-01", due="2026-04-30")
    _pay(tenant, small["id"], "2026-04-30")

    data = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in data["entidades"] if e["entity_name"] == "Cliente Misto")

    # An unweighted mean would give 30; weighting by amount gives ~59.
    assert entry["atraso_medio"] >= 58
    assert entry["pontualidade"] == 50


def test_behaviour_does_not_count_paying_early_as_negative(tenant):
    for issued, due, paid in [("2026-03-01", "2026-03-31", "2026-03-10"),
                              ("2026-04-01", "2026-04-30", "2026-04-05")]:
        trx = _invoice(tenant, entity="Cliente Adiantado", amount=500,
                       issued=issued, due=due)
        _pay(tenant, trx["id"], paid)

    data = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in data["entidades"] if e["entity_name"] == "Cliente Adiantado")
    assert entry["atraso_medio"] == 0
    assert entry["pontualidade"] == 100


def test_behaviour_needs_more_than_one_document_to_be_a_habit(tenant):
    trx = _invoice(tenant, entity="Cliente Único", amount=400,
                   issued="2026-03-01", due="2026-03-31")
    _pay(tenant, trx["id"], "2026-05-01")

    data = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in data["entidades"] if e["entity_name"] == "Cliente Único")
    assert entry["documentos"] == 1
    assert entry["fiavel"] is False           # recorded, but not yet trusted


def test_behaviour_uses_the_last_payment_of_a_split_settlement(tenant):
    trx = _invoice(tenant, entity="Cliente Parcelado", amount=1000,
                   issued="2026-03-01", due="2026-03-31")
    _pay(tenant, trx["id"], "2026-04-10", amount=400)
    _pay(tenant, trx["id"], "2026-05-10", amount=600)   # settles it

    second = _invoice(tenant, entity="Cliente Parcelado", amount=1000,
                      issued="2026-04-01", due="2026-04-30")
    _pay(tenant, second["id"], "2026-06-09")

    data = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in data["entidades"] if e["entity_name"] == "Cliente Parcelado")
    # 40 days on both, from due date to the *last* payment.
    assert entry["atraso_medio"] == 40


# ---------------------------------------------------------------------------
# The forecast, now that it knows better
# ---------------------------------------------------------------------------

def test_forecast_shifts_a_receivable_to_when_the_client_actually_pays(tenant):
    # A client with a settled history of paying 30 days late.
    for issued, due, paid in [("2026-03-01", "2026-03-31", "2026-04-30"),
                              ("2026-04-01", "2026-04-30", "2026-05-30")]:
        trx = _invoice(tenant, entity="Cliente Lento", amount=1000,
                       issued=issued, due=due)
        _pay(tenant, trx["id"], paid)

    # An open invoice due next week.
    _invoice(tenant, entity="Cliente Lento", amount=5000,
             issued="2026-09-01", due="2026-09-10")

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=13&today=2026-09-01").json()
    movement = next(
        m for week in data["semanas"] for m in week["movimentos"]
        if m["amount"] == 5000.0
    )
    # Due 10 Sep, habitually 30 days late → around 10 Oct, not the due date.
    assert movement["date"] == "2026-10-10"
    assert "+30d" in movement["label"]


def test_forecast_keeps_the_due_date_when_there_is_no_history(tenant):
    _invoice(tenant, entity="Cliente Novo", amount=2500,
             issued="2026-09-01", due="2026-09-18")

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=13&today=2026-09-01").json()
    movement = next(
        m for week in data["semanas"] for m in week["movimentos"]
        if m["amount"] == 2500.0
    )
    assert movement["date"] == "2026-09-18"
    assert "habitualmente" not in movement["label"]


def test_forecast_still_lands_an_overdue_document_today(tenant):
    for issued, due, paid in [("2026-03-01", "2026-03-31", "2026-05-30"),
                              ("2026-04-01", "2026-04-30", "2026-06-29")]:
        trx = _invoice(tenant, entity="Cliente Lento", amount=1000,
                       issued=issued, due=due)
        _pay(tenant, trx["id"], paid)

    _invoice(tenant, entity="Cliente Lento", amount=900,
             issued="2026-06-01", due="2026-06-15")     # long overdue

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=13&today=2026-09-01").json()
    movement = next(
        m for week in data["semanas"] for m in week["movimentos"]
        if m["amount"] == 900.0
    )
    assert movement["date"] == "2026-09-01"
    assert movement["certainty"] == "vencido"


def test_a_pathological_delay_does_not_push_money_off_the_horizon(tenant):
    # Two invoices settled a year late — a dispute, not a habit.
    for issued, due, paid in [("2025-01-01", "2025-01-31", "2026-01-31"),
                              ("2025-02-01", "2025-02-28", "2026-02-28")]:
        trx = _invoice(tenant, entity="Cliente Litígio", amount=1000,
                       issued=issued, due=due)
        _pay(tenant, trx["id"], paid)

    _invoice(tenant, entity="Cliente Litígio", amount=3000,
             issued="2026-09-01", due="2026-09-05")

    behaviour = tenant.get("/api/v1/collections/behaviour?kind=income").json()
    entry = next(e for e in behaviour["entidades"] if e["entity_name"] == "Cliente Litígio")
    assert entry["atraso_medio"] > 300              # the raw history is extreme

    data = tenant.get("/api/v1/transactions/cash-forecast?weeks=26&today=2026-09-01").json()
    movement = next(
        (m for week in data["semanas"] for m in week["movimentos"] if m["amount"] == 3000.0),
        None,
    )
    # Capped at 120 days, so it stays inside a horizon a person can act on.
    assert movement is not None
    assert movement["date"] == (date(2026, 9, 5) + timedelta(days=120)).isoformat()


# ---------------------------------------------------------------------------
# Overview, reminders and isolation
# ---------------------------------------------------------------------------

def test_overview_names_the_worst_debtor(tenant):
    _invoice(tenant, entity="Grande Devedor", amount=4000,
             issued="2026-05-01", due="2026-05-31")
    _invoice(tenant, entity="Pequeno Devedor", amount=150,
             issued="2026-08-01", due="2026-08-20")
    tenant.book("expense", 600, date="2026-07-01", due_date="2026-07-31",
                entity_name="Fornecedor")

    data = tenant.get("/api/v1/collections/?today=2026-09-01").json()
    assert data["a_receber"]["vencido"] == 4150.0
    assert data["a_pagar"]["vencido"] == 600.0
    assert "Grande Devedor" in data["mensagem"]


def test_overview_is_calm_when_nothing_is_overdue(tenant):
    _invoice(tenant, entity="Cliente", amount=300,
             issued="2026-09-01", due="2026-09-30")
    data = tenant.get("/api/v1/collections/?today=2026-09-01").json()
    assert "Nada vencido" in data["mensagem"]


def test_reminder_drafts_a_letter_without_sending_anything(tenant):
    first = _invoice(tenant, entity="Cliente Esquecido", amount=1200,
                     issued="2026-06-01", due="2026-06-30")
    second = _invoice(tenant, entity="Cliente Esquecido", amount=800,
                      issued="2026-07-01", due="2026-07-31")

    response = tenant.post("/api/v1/collections/reminder", {
        "entity_name": "Cliente Esquecido",
        "transaction_ids": [first["id"], second["id"]],
    })
    assert response.status_code == 200
    draft = response.json()

    assert draft["documentos"] == 2
    assert draft["total"] == 2000.0
    assert "2026-06-30" in draft["corpo"]
    assert "2 000.00 €" in draft["corpo"] or "2,000.00 €" in draft["corpo"]
    assert "Cliente Esquecido" == draft["destinatario"]


def test_reminder_needs_at_least_one_document(tenant):
    assert tenant.post("/api/v1/collections/reminder", {"transaction_ids": []}).status_code == 400


def test_reminder_cannot_reach_another_company_documents(tenant, other_tenant):
    theirs = _invoice(other_tenant, entity="Cliente Alheio", amount=500,
                      issued="2026-06-01", due="2026-06-30")
    response = tenant.post("/api/v1/collections/reminder",
                           {"transaction_ids": [theirs["id"]]})
    assert response.status_code == 404


def test_aging_is_scoped_to_the_active_company(tenant, other_tenant):
    _invoice(other_tenant, entity="Cliente Alheio", amount=9999,
             issued="2026-06-01", due="2026-06-30")
    data = tenant.get("/api/v1/collections/aging?kind=income&today=2026-09-01").json()
    assert data["total"] == 0.0
