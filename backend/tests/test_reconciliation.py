"""A bank line is proof money moved, so matching one settles the obligation."""

import pytest

from app.db.session import SessionLocal
from app.models.models import BankStatement, BankStatementEntry


@pytest.fixture
def statement(tenant):
    """Three bank lines: a payment, a receipt, and a bank fee with no counterpart."""
    db = SessionLocal()
    prefix = tenant.company_id[-8:]
    db.add(BankStatement(id=f"ST-{prefix}", company_id=tenant.company_id,
                         bank_name="CGD", file_name="extrato.csv", status="completed"))
    lines = [
        (f"E1-{prefix}", "2026-08-20", "TRF EDP COMERCIAL FT 452", 123.00, "debit"),
        (f"E2-{prefix}", "2026-08-26", "TRF RECEBIDA CLIENTE SILVA", 500.00, "credit"),
        (f"E3-{prefix}", "2026-08-31", "COMISSAO MANUTENCAO CONTA", 6.50, "debit"),
    ]
    for entry_id, day, description, amount, kind in lines:
        db.add(BankStatementEntry(id=entry_id, statement_id=f"ST-{prefix}",
                                  company_id=tenant.company_id, date=day,
                                  description=description, amount=amount, type=kind))
    db.commit()
    db.close()
    return {"payment": f"E1-{prefix}", "receipt": f"E2-{prefix}", "fee": f"E3-{prefix}"}


@pytest.fixture
def obligations(tenant):
    expense = tenant.book("expense", 123.00, date="2026-08-20",
                          description="Fatura eletricidade", entity_name="EDP Comercial",
                          due_date="2026-08-20")
    income = tenant.book("income", 500.00, date="2026-08-25",
                         description="Serviço de consultoria", entity_name="Cliente Silva",
                         category=tenant.category("income"), due_date="2026-08-25")
    return {"expense": expense, "income": income}


def test_suggestions_require_the_amount_to_the_cent(tenant, statement, obligations):
    proposals = tenant.get(f"/api/v1/bank/entries/{statement['payment']}/suggestions").json()
    assert proposals[0]["transaction_id"] == obligations["expense"]["id"]
    assert "valor igual ao cêntimo" in proposals[0]["porque"]


def test_a_bank_fee_has_no_counterpart(tenant, statement, obligations):
    assert tenant.get(f"/api/v1/bank/entries/{statement['fee']}/suggestions").json() == []


def test_matching_creates_the_payment_and_settles_the_obligation(tenant, statement, obligations):
    result = tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                         {"transaction_id": obligations["expense"]["id"]}).json()
    assert result["criou_pagamento"] is True
    assert result["payment_status"] == "paid"
    assert result["outstanding_amount"] == 0.0

    payments = tenant.get(f"/api/v1/transactions/{obligations['expense']['id']}/payments").json()
    assert len(payments) == 1


def test_the_same_line_cannot_be_matched_twice(tenant, statement, obligations):
    tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                {"transaction_id": obligations["expense"]["id"]})
    again = tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                        {"transaction_id": obligations["expense"]["id"]})
    assert again.status_code == 409


def test_a_credit_cannot_settle_an_expense(tenant, statement, obligations):
    response = tenant.post(f"/api/v1/bank/entries/{statement['receipt']}/match",
                           {"transaction_id": obligations["expense"]["id"]})
    assert response.status_code == 409


def test_undoing_removes_the_payment_the_bank_line_created(tenant, statement, obligations):
    tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                {"transaction_id": obligations["expense"]["id"]})
    undone = tenant.post(f"/api/v1/bank/entries/{statement['payment']}/unmatch", {}).json()
    assert undone["pagamento_removido"] is True
    payments = tenant.get(f"/api/v1/transactions/{obligations['expense']['id']}/payments").json()
    assert payments == []


def test_undoing_keeps_a_payment_registered_by_hand(tenant, statement, obligations):
    trx_id = obligations["expense"]["id"]
    tenant.post(f"/api/v1/transactions/{trx_id}/payments",
                {"amount": 123.00, "payment_date": "2026-08-20"})
    matched = tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                          {"transaction_id": trx_id}).json()
    assert matched["criou_pagamento"] is False

    undone = tenant.post(f"/api/v1/bank/entries/{statement['payment']}/unmatch", {}).json()
    assert undone["pagamento_removido"] is False
    assert len(tenant.get(f"/api/v1/transactions/{trx_id}/payments").json()) == 1


def test_a_line_larger_than_what_is_open_is_refused(tenant, statement, obligations):
    response = tenant.post(f"/api/v1/bank/entries/{statement['receipt']}/match",
                           {"transaction_id": obligations["income"]["id"]})
    assert response.status_code == 200          # 500 = 500, this one fits

    db = SessionLocal()
    entry = BankStatementEntry(
        id=f"E9-{tenant.company_id[-8:]}", statement_id=f"ST-{tenant.company_id[-8:]}",
        company_id=tenant.company_id, date="2026-08-20", description="TRF GRANDE",
        amount=999.00, type="debit",
    )
    db.add(entry)
    db.commit()
    db.close()
    too_big = tenant.post(f"/api/v1/bank/entries/E9-{tenant.company_id[-8:]}/match",
                          {"transaction_id": obligations["expense"]["id"]})
    assert too_big.status_code == 409


def test_a_fee_can_be_parked_as_ignored(tenant, statement):
    result = tenant.post(f"/api/v1/bank/entries/{statement['fee']}/ignore", {}).json()
    assert result["entry_status"] == "ignored"


def test_overview_counts_only_real_reconciliations(tenant, statement, obligations):
    tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                {"transaction_id": obligations["expense"]["id"]})
    overview = tenant.get("/api/v1/bank/reconciliation/overview").json()
    assert overview["conciliados"] == 1
    assert overview["por_conciliar"] == 2


def test_statement_money_is_decimal_not_float(tenant, statement):
    from decimal import Decimal
    db = SessionLocal()
    entry = db.query(BankStatementEntry).filter(
        BankStatementEntry.id == statement["payment"]).first()
    assert isinstance(entry.amount, Decimal)
    db.close()


def test_entries_are_invisible_to_another_company(tenant, other_tenant, statement, obligations):
    response = other_tenant.post(f"/api/v1/bank/entries/{statement['payment']}/match",
                                 {"transaction_id": obligations["expense"]["id"]})
    assert response.status_code == 404
