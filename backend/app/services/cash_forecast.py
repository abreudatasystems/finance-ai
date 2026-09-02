"""Previsão de tesouraria — the question a small company actually asks.

Not "what was my result last quarter" but **"on the 28th I have to pay
salaries; will the money be there?"**. The product already held every piece of
that answer — the cash balance, the invoices with due dates, the recurring
costs that have not been booked yet, the VAT and its statutory deadline — and
nowhere put them on one timeline. This does.

Rules that keep it honest:

* it starts from **real cash**: the bank balance from actual payments, never
  from invoices;
* every future movement enters on the date it is expected, not the date it was
  issued: a receivable lands on its due date, an overdue one lands now,
  because that is the earliest it can realistically arrive;
* recurring costs that have not been generated yet are included — a forecast
  that ignores next month's rent is not a forecast;
* the VAT lands on the statutory payment date, which is the single largest
  surprise in a small company's month;
* nothing is invented. Every line names where it came from, so a number can be
  argued with.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import Company, Recurrence, Transaction
from app.services import financials, recurrences as recurrence_service
from app.services.vat_engine import compute_vat_position, resolve_period

CENTS = Decimal("0.01")

#: Thirteen weeks is the horizon a treasurer works to: far enough to act,
#: close enough that the numbers still mean something.
DEFAULT_WEEKS = 13


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _movement(when: date, kind: str, label: str, amount: Decimal, origin: str,
              reference: Optional[str] = None, certainty: str = "confirmado") -> dict:
    return {
        "date": when.isoformat(),
        "kind": kind,                    # in | out
        "label": label,
        "amount": float(amount),
        "origin": origin,                # documento | recorrência | IVA
        "reference": reference,
        # confirmado: a document exists. previsto: it will exist (a recurrence).
        "certainty": certainty,
    }


def _receivables_and_payables(db: Session, company_id: str, today: date, horizon: date) -> list[dict]:
    """Open documents, each landing on the day the money is expected."""
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.status.notin_(("cancelled", "draft")),
            Transaction.payment_status.in_(("pending", "partially_paid", "overdue")),
        )
        .all()
    )

    movements = []
    for trx in rows:
        outstanding = _d(trx.outstanding_amount)
        if outstanding <= 0:
            continue

        due = trx.due_date or trx.date
        try:
            when = date.fromisoformat(due[:10])
        except (TypeError, ValueError):
            when = today
        # Already overdue: the earliest it can realistically move is now.
        if when < today:
            when = today
        if when > horizon:
            continue

        movements.append(_movement(
            when,
            "in" if trx.type == "income" else "out",
            trx.description or trx.entity_name or "Movimento",
            outstanding,
            "documento",
            trx.id,
            "vencido" if (trx.due_date or "") < today.isoformat() else "confirmado",
        ))
    return movements


def _future_recurrences(db: Session, company_id: str, today: date, horizon: date) -> list[dict]:
    """Rent, salaries and subscriptions that have not been booked yet.

    Only the periods with no occurrence, so a recurrence already generated as a
    document is not counted twice — it is already in the payables above.
    """
    movements = []
    for rec in (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id, Recurrence.active.isnot(False))
        .all()
    ):
        done = recurrence_service._existing_periods(db, rec.id)
        for when in recurrence_service.occurrences_due(rec, horizon):
            if when < today or when > horizon:
                continue
            if recurrence_service.period_key(rec.frequency, when) in done:
                continue
            movements.append(_movement(
                when,
                "in" if rec.type == "income" else "out",
                rec.name,
                _d(rec.amount),
                "recorrência",
                rec.id,
                "previsto",
            ))
    return movements


def _vat_payment(db: Session, company_id: str, today: date, horizon: date) -> list[dict]:
    """The VAT of the closed period, on the day it is actually due.

    The biggest avoidable surprise in a small company's quarter: the money was
    collected months ago and spent, and the payment date arrives anyway.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company or (company.vat_regime or "normal") != "normal":
        return []

    periodicity = company.vat_periodicity or "quarterly"
    movements = []
    seen = set()

    # The period that has closed, and the one closing inside the horizon.
    _, _, current_start, _ = resolve_period(periodicity, None, today)
    candidates = [date.fromisoformat(current_start) - timedelta(days=1), today]

    for reference in candidates:
        _, key, _, _ = resolve_period(periodicity, None, reference)
        if key in seen:
            continue
        seen.add(key)

        position = compute_vat_position(db, company_id, key, today)
        due = position["apuramento"]["a_entregar"]
        if due <= 0:
            continue

        when = date.fromisoformat(position["prazos"]["pagamento_ate"])
        if when < today:
            when = today          # already late: it has to come out of the next cash
        if when > horizon:
            continue

        movements.append(_movement(
            when, "out", f"IVA {position['period']['label']}", _d(due), "IVA", key,
            "vencido" if position["prazos"]["pagamento_ate"] < today.isoformat() else "confirmado",
        ))
    return movements


def build(db: Session, company_id: str, weeks: int = DEFAULT_WEEKS,
          today: Optional[date] = None) -> dict:
    """The next `weeks` weeks of cash, week by week, with the low point named."""
    today = today or date.today()
    weeks = max(1, min(weeks, 52))
    horizon = today + timedelta(weeks=weeks)

    cash = financials.cash_position(db, company_id, until=today.isoformat())
    opening = _d(cash["saldo"])

    movements = (
        _receivables_and_payables(db, company_id, today, horizon)
        + _future_recurrences(db, company_id, today, horizon)
        + _vat_payment(db, company_id, today, horizon)
    )
    movements.sort(key=lambda m: (m["date"], m["kind"]))

    # Week buckets, starting on the Monday of the current week so the labels
    # match how people talk about their weeks.
    week_start = today - timedelta(days=today.weekday())
    buckets = []
    balance = opening
    low = {"balance": float(opening), "date": today.isoformat()}
    negative_from: Optional[str] = None

    for index in range(weeks):
        start = week_start + timedelta(weeks=index)
        end = start + timedelta(days=7)
        inside = [m for m in movements if start.isoformat() <= m["date"] < end.isoformat()]

        inflow = sum((_d(m["amount"]) for m in inside if m["kind"] == "in"), Decimal("0.00"))
        outflow = sum((_d(m["amount"]) for m in inside if m["kind"] == "out"), Decimal("0.00"))
        opening_week = balance
        balance = (balance + inflow - outflow).quantize(CENTS, rounding=ROUND_HALF_UP)

        if balance < _d(low["balance"]):
            low = {"balance": float(balance), "date": end.isoformat()}
        if balance < 0 and negative_from is None:
            negative_from = start.isoformat()

        buckets.append({
            "inicio": start.isoformat(),
            "fim": (end - timedelta(days=1)).isoformat(),
            "semana": index + 1,
            "saldo_inicial": float(opening_week),
            "entradas": float(inflow),
            "saidas": float(outflow),
            "saldo_final": float(balance),
            "movimentos": inside,
        })

    total_in = sum((_d(m["amount"]) for m in movements if m["kind"] == "in"), Decimal("0.00"))
    total_out = sum((_d(m["amount"]) for m in movements if m["kind"] == "out"), Decimal("0.00"))
    uncertain = sum(
        (_d(m["amount"]) for m in movements if m["certainty"] == "previsto" and m["kind"] == "out"),
        Decimal("0.00"),
    )
    overdue_in = sum(
        (_d(m["amount"]) for m in movements if m["certainty"] == "vencido" and m["kind"] == "in"),
        Decimal("0.00"),
    )

    return {
        "hoje": today.isoformat(),
        "horizonte": horizon.isoformat(),
        "semanas": buckets,
        "saldo_inicial": float(opening),
        "saldo_final": float(balance),
        "total_entradas": float(total_in),
        "total_saidas": float(total_out),
        "ponto_baixo": low,
        "fica_negativo_em": negative_from,
        "resumo": {
            "aperta": negative_from is not None,
            "recebimentos_vencidos": float(overdue_in),
            "saidas_previstas_sem_documento": float(uncertain),
            "mensagem": _message(negative_from, low, opening, balance, overdue_in),
        },
    }


def _message(negative_from: Optional[str], low: dict, opening: Decimal,
             closing: Decimal, overdue_in: Decimal) -> str:
    """One sentence a person can act on."""
    if negative_from:
        base = (
            f"Com o que está previsto, a conta fica negativa a partir de "
            f"{negative_from} (mínimo de {low['balance']:,.2f} €)."
        )
        if overdue_in > 0:
            base += (
                f" Há {float(overdue_in):,.2f} € de faturas já vencidas por cobrar — "
                "é o caminho mais curto para evitar isso."
            )
        return base
    if _d(low["balance"]) < opening / 4 and opening > 0:
        return (
            f"A conta aguenta, mas desce até {low['balance']:,.2f} € por volta de "
            f"{low['date']}. Convém não marcar despesas novas para essa altura."
        )
    return f"Sem apertos à vista: o saldo previsto no fim do período é {float(closing):,.2f} €."
