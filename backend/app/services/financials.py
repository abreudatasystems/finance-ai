"""The primitives every number in the product should agree on.

Two distinctions were being blurred, and both of them change what a figure
means:

**Gross vs net.** An invoice of 1 000 € + 23% is revenue of 1 000 €, not
1 230 €. The VAT is money held for the State — it is neither income nor
expense — so results, margins and the income statement are computed on the
net amount. Only the cash position cares about the gross, because that is
what actually moves.

**Accrual vs cash.** The result of a period comes from the documents dated in
it, whether or not anyone has paid. The cash position comes from the payments
that actually happened. Calling one by the other's name — "saldo de caixa"
computed from invoices — produces a number that is true of nothing.

Everything here is derived; nothing is stored.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.models import BankAccount, Payment, Transaction, TransactionLine

CENTS = Decimal("0.01")

#: Documents that never count towards a result.
EXCLUDED_STATUSES = ("cancelled", "draft", "pending_approval", "pending_ai")


def d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def net_of(trx: Transaction, line_totals: Optional[dict] = None) -> Decimal:
    """The revenue or cost this document represents, without VAT.

    Lines win when the document has them, because a mixed-rate invoice's true
    base is the sum of its lines. Then the recorded net. Only when neither
    exists does the gross stand in — a document with no VAT information is
    assumed to carry none, which is the safer of the two guesses: it never
    inflates a result.
    """
    if line_totals and trx.id in line_totals:
        return line_totals[trx.id]
    if trx.net_amount is not None:
        return d(trx.net_amount)
    return d(trx.gross_amount if trx.gross_amount is not None else trx.amount)


def line_net_totals(db: Session, company_id: str, ids: Iterable[str]) -> dict:
    """Net per transaction for the documents detailed by lines."""
    ids = list(ids)
    if not ids:
        return {}
    totals: dict = {}
    for line in (
        db.query(TransactionLine)
        .filter(TransactionLine.company_id == company_id,
                TransactionLine.transaction_id.in_(ids))
        .all()
    ):
        totals[line.transaction_id] = totals.get(line.transaction_id, Decimal("0.00")) + d(line.net_amount)
    return totals


def documents_in_period(db: Session, company_id: str, start: str, end: str,
                        kind: Optional[str] = None) -> list[Transaction]:
    """Documents dated in [start, end) — the accrual view of a period."""
    query = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status.notin_(EXCLUDED_STATUSES),
        )
    )
    if kind:
        query = query.filter(Transaction.type == kind)
    return query.order_by(Transaction.date).all()


def period_result(db: Session, company_id: str, start: str, end: str) -> dict:
    """Revenue, cost and result for a period — net of VAT, on the accrual basis."""
    rows = documents_in_period(db, company_id, start, end)
    nets = line_net_totals(db, company_id, [t.id for t in rows])

    revenue = sum((net_of(t, nets) for t in rows if t.type == "income"), Decimal("0.00"))
    cost = sum((net_of(t, nets) for t in rows if t.type == "expense"), Decimal("0.00"))
    gross_revenue = sum((d(t.amount) for t in rows if t.type == "income"), Decimal("0.00"))
    gross_cost = sum((d(t.amount) for t in rows if t.type == "expense"), Decimal("0.00"))
    result = (revenue - cost).quantize(CENTS, rounding=ROUND_HALF_UP)

    return {
        "rendimentos": float(revenue),
        "gastos": float(cost),
        "resultado": float(result),
        "margem": float(round(result / revenue * 100, 1)) if revenue > 0 else 0.0,
        # Kept so a screen can show what was invoiced including VAT without
        # anyone recomputing it from the wrong field.
        "faturado_com_iva": float(gross_revenue),
        "gasto_com_iva": float(gross_cost),
        "documentos": len(rows),
    }


def cash_position(db: Session, company_id: str, until: Optional[str] = None) -> dict:
    """What is actually in the accounts: opening balances plus real movements.

    This is the only figure entitled to be called a cash balance. It counts
    payments, not invoices, so an unpaid invoice does not make the company look
    richer than it is.
    """
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.company_id == company_id, BankAccount.active.isnot(False))
        .all()
    )
    opening = sum((d(a.opening_balance) for a in accounts), Decimal("0.00"))

    query = db.query(Payment).filter(Payment.company_id == company_id)
    if until:
        query = query.filter(Payment.payment_date <= until)
    payments = query.all()

    received = sum((d(p.amount) for p in payments if p.direction == "in"), Decimal("0.00"))
    paid = sum((d(p.amount) for p in payments if p.direction == "out"), Decimal("0.00"))
    balance = (opening + received - paid).quantize(CENTS, rounding=ROUND_HALF_UP)

    return {
        "saldo": float(balance),
        "saldo_inicial": float(opening),
        "recebido": float(received),
        "pago": float(paid),
        "contas": len(accounts),
        "movimentos": len(payments),
    }


def open_positions(db: Session, company_id: str, today: str) -> dict:
    """What is owed in each direction — the bridge between result and cash."""
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.status.notin_(("cancelled", "draft")),
            Transaction.payment_status.in_(("pending", "partially_paid", "overdue")),
        )
        .all()
    )
    to_pay = sum((d(t.outstanding_amount) for t in rows if t.type == "expense"), Decimal("0.00"))
    to_receive = sum((d(t.outstanding_amount) for t in rows if t.type == "income"), Decimal("0.00"))
    overdue_pay = sum(
        (d(t.outstanding_amount) for t in rows
         if t.type == "expense" and t.due_date and t.due_date < today),
        Decimal("0.00"),
    )
    overdue_receive = sum(
        (d(t.outstanding_amount) for t in rows
         if t.type == "income" and t.due_date and t.due_date < today),
        Decimal("0.00"),
    )
    return {
        "a_pagar": float(to_pay),
        "a_receber": float(to_receive),
        "a_pagar_vencido": float(overdue_pay),
        "a_receber_vencido": float(overdue_receive),
    }
