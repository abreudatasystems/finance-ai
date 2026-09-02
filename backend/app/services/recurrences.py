"""Recurrences — the costs and revenues that come back every period.

Rent, salaries, subscriptions, avenças: the same document, over and over. The
transactions carried an ``is_recurring`` flag that nothing ever acted on, so
somebody retyped the rent every month.

The rules here:

* a recurrence describes **what** to book and **how often**, not when someone
  remembered to do it;
* generation is **idempotent per period** — each period produces at most one
  occurrence, so running it twice, or twice a day, cannot double the rent;
* an occurrence books an obligation with a due date, exactly like an approved
  invoice: it is never marked as paid, because nothing was paid yet;
* skipping a period is a recorded decision, not a gap nobody can explain.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.models import Recurrence, RecurrenceOccurrence, Transaction

CENTS = Decimal("0.01")

FREQUENCIES = {
    "weekly": "Semanal",
    "monthly": "Mensal",
    "quarterly": "Trimestral",
    "yearly": "Anual",
}


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _parse(day: str) -> date:
    return date.fromisoformat(day[:10])


def _clamp_day(year: int, month: int, day: int) -> date:
    """Day 31 in February is the 28th (or 29th) — the bill still exists."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def _add_months(base: date, months: int, day_of_month: Optional[int]) -> date:
    index = base.month - 1 + months
    year = base.year + index // 12
    month = index % 12 + 1
    return _clamp_day(year, month, day_of_month or base.day)


def period_key(frequency: str, when: date) -> str:
    """The idempotency key: one occurrence per key, ever."""
    if frequency == "yearly":
        return f"{when.year}"
    if frequency == "quarterly":
        return f"{when.year}-T{(when.month - 1) // 3 + 1}"
    if frequency == "weekly":
        iso = when.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    return f"{when.year}-{when.month:02d}"


def occurrences_due(rec: Recurrence, until: date) -> list[date]:
    """Every due date this rule has reached, from its start up to ``until``."""
    start = _parse(rec.start_date)
    end = _parse(rec.end_date) if rec.end_date else None
    step = max(1, rec.interval or 1)

    dates: list[date] = []
    current = start
    if rec.frequency in ("monthly", "quarterly", "yearly"):
        current = _clamp_day(start.year, start.month, rec.day_of_month or start.day)
        if current < start:
            current = _add_months(current, 1 if rec.frequency == "monthly" else 3 if rec.frequency == "quarterly" else 12,
                                  rec.day_of_month)

    guard = 0
    while current <= until and guard < 500:
        guard += 1
        if end and current > end:
            break
        dates.append(current)
        if rec.frequency == "weekly":
            current = date.fromordinal(current.toordinal() + 7 * step)
        elif rec.frequency == "monthly":
            current = _add_months(current, step, rec.day_of_month)
        elif rec.frequency == "quarterly":
            current = _add_months(current, 3 * step, rec.day_of_month)
        else:
            current = _add_months(current, 12 * step, rec.day_of_month)
    return dates


def next_due(rec: Recurrence, today: Optional[date] = None) -> Optional[str]:
    """When this rule fires next — what the list needs to show."""
    today = today or date.today()
    end = _parse(rec.end_date) if rec.end_date else None
    if end and end < today:
        return None
    horizon = _add_months(today, 24, None)
    for when in occurrences_due(rec, horizon):
        if when >= today:
            return when.isoformat()
    return None


def serialize(rec: Recurrence, generated: int = 0) -> dict:
    return {
        "id": rec.id,
        "company_id": rec.company_id,
        "name": rec.name,
        "type": rec.type,
        "description": rec.description,
        "entity_id": rec.entity_id,
        "entity_name": rec.entity_name,
        "category_id": rec.category_id,
        "category_name": rec.category_name,
        "amount": float(_d(rec.amount)),
        "vat_rate": rec.vat_rate,
        "payment_method": rec.payment_method,
        "notes": rec.notes,
        "frequency": rec.frequency,
        "frequency_label": FREQUENCIES.get(rec.frequency, rec.frequency),
        "interval": rec.interval or 1,
        "day_of_month": rec.day_of_month,
        "start_date": rec.start_date,
        "end_date": rec.end_date,
        "lead_days": rec.lead_days or 0,
        "active": rec.active is not False,
        "last_generated_period": rec.last_generated_period,
        "occurrences_created": rec.occurrences_created or 0,
        "proximo_vencimento": next_due(rec),
        "gerados": generated,
    }


def scoped(db: Session, company_id: str, recurrence_id: str) -> Recurrence:
    rec = (
        db.query(Recurrence)
        .filter(Recurrence.id == recurrence_id, Recurrence.company_id == company_id)
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")
    return rec


def create(db: Session, company_id: str, data: dict) -> Recurrence:
    if data.get("frequency") not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Frequência inválida")
    if _d(data.get("amount")) <= 0:
        raise HTTPException(status_code=400, detail="O valor tem de ser positivo")
    if data.get("type") not in ("expense", "income"):
        raise HTTPException(status_code=400, detail="Tipo inválido: use 'expense' ou 'income'")
    try:
        _parse(data["start_date"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Data de início inválida (use AAAA-MM-DD)")

    rec = Recurrence(
        id=f"REC-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        company_id=company_id,
        **{k: v for k, v in data.items() if v is not None},
    )
    rec.amount = _d(data.get("amount"))
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def update(db: Session, company_id: str, recurrence_id: str, data: dict) -> Recurrence:
    rec = scoped(db, company_id, recurrence_id)
    if "frequency" in data and data["frequency"] not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Frequência inválida")
    if "amount" in data:
        data["amount"] = _d(data["amount"])
        if data["amount"] <= 0:
            raise HTTPException(status_code=400, detail="O valor tem de ser positivo")
    for field, value in data.items():
        setattr(rec, field, value)
    db.commit()
    db.refresh(rec)
    return rec


def remove(db: Session, company_id: str, recurrence_id: str) -> dict:
    """Stop the rule; the transactions it already produced stay untouched."""
    rec = scoped(db, company_id, recurrence_id)
    produced = (
        db.query(RecurrenceOccurrence)
        .filter(RecurrenceOccurrence.recurrence_id == rec.id)
        .count()
    )
    if produced:
        rec.active = False
        db.commit()
        return {
            "status": "paused",
            "recurrence_id": rec.id,
            "message": (
                f"'{rec.name}' já gerou {produced} lançamento(s); foi desativada em vez de "
                "eliminada para o histórico continuar completo."
            ),
        }
    db.delete(rec)
    db.commit()
    return {"status": "deleted", "recurrence_id": rec.id}


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------

def _existing_periods(db: Session, recurrence_id: str) -> set:
    return {
        row[0]
        for row in db.query(RecurrenceOccurrence.period)
        .filter(RecurrenceOccurrence.recurrence_id == recurrence_id)
        .all()
    }


def generate_for(db: Session, company_id: str, rec: Recurrence,
                 until: Optional[date] = None, created_by: str = "Recorrência") -> list[dict]:
    """Book every period this rule has reached and has not booked yet."""
    if rec.active is False:
        return []

    today = date.today()
    until = until or today
    done = _existing_periods(db, rec.id)
    created = []

    for due in occurrences_due(rec, until):
        key = period_key(rec.frequency, due)
        if key in done:
            continue

        # lead_days books the obligation before it falls due, which is what
        # makes it show up in the cash forecast in time to act on it.
        book_date = date.fromordinal(due.toordinal() - (rec.lead_days or 0))
        if book_date > until:
            continue

        gross = _d(rec.amount)
        rate = Decimal(str(rec.vat_rate)) if rec.vat_rate else None
        net = (gross / (Decimal("1") + rate / Decimal("100"))).quantize(CENTS, rounding=ROUND_HALF_UP) if rate else gross
        vat = (gross - net).quantize(CENTS, rounding=ROUND_HALF_UP)

        stamp = int(datetime.now(timezone.utc).timestamp() * 1000000)
        trx = Transaction(
            id=f"TRX-REC-{stamp}",
            company_id=company_id,
            date=book_date.isoformat(),
            due_date=due.isoformat(),
            type=rec.type,
            description=rec.description,
            entity_id=rec.entity_id,
            entity_name=rec.entity_name or "",
            category_id=rec.category_id or "",
            category_name=rec.category_name or "Por classificar",
            amount=gross,
            net_amount=net,
            vat_rate=rec.vat_rate,
            vat_amount=vat,
            gross_amount=gross,
            currency="EUR",
            # An occurrence is an obligation, never a settled payment.
            paid_amount=Decimal("0.00"),
            outstanding_amount=gross,
            payment_status="pending",
            status="approved",
            source="recurring",
            is_recurring=True,
            recurrence_period=rec.frequency,
            payment_method=rec.payment_method,
            notes=rec.notes,
            created_by=created_by,
        )
        occurrence = RecurrenceOccurrence(
            id=f"ROC-{stamp}",
            company_id=company_id,
            recurrence_id=rec.id,
            period=key,
            due_date=due.isoformat(),
            amount=gross,
            status="generated",
            transaction_id=trx.id,
        )

        # A verificação acima evita o trabalho; esta trata do caso em que outro
        # processo chegou ao mesmo período entre a leitura e a escrita. Quem
        # perde a corrida desfaz o que ia escrever e segue — o período está
        # tratado, que é o que interessa.
        try:
            with db.begin_nested():
                db.add(trx)
                db.add(occurrence)
                db.flush()
        except IntegrityError:
            done.add(key)
            continue

        done.add(key)
        rec.last_generated_period = key
        rec.last_generated_at = datetime.now(timezone.utc)
        rec.occurrences_created = (rec.occurrences_created or 0) + 1
        created.append({
            "period": key,
            "due_date": due.isoformat(),
            "amount": float(gross),
            "transaction_id": trx.id,
        })

    if created:
        db.commit()
    return created


def run(db: Session, company_id: str, until: Optional[date] = None,
        created_by: str = "Recorrência", recurrence_id: Optional[str] = None) -> dict:
    """Generate everything due for the company — safe to call as often as you like."""
    query = db.query(Recurrence).filter(
        Recurrence.company_id == company_id,
        Recurrence.active.isnot(False),
    )
    if recurrence_id:
        query = query.filter(Recurrence.id == recurrence_id)

    total, detail = 0, []
    for rec in query.all():
        created = generate_for(db, company_id, rec, until, created_by)
        if created:
            total += len(created)
            detail.append({"recurrence_id": rec.id, "name": rec.name, "lancamentos": created})

    return {
        "status": "success",
        "gerados": total,
        "detalhe": detail,
        "message": (
            f"{total} lançamento(s) gerado(s)." if total
            else "Nada por gerar — todas as recorrências já estão em dia."
        ),
    }


def skip(db: Session, company_id: str, recurrence_id: str, period: str) -> dict:
    """Record that a period is deliberately not booked (a month with no rent)."""
    rec = scoped(db, company_id, recurrence_id)
    if period in _existing_periods(db, rec.id):
        raise HTTPException(status_code=409, detail=f"O período {period} já foi tratado")

    db.add(RecurrenceOccurrence(
        id=f"ROC-{int(datetime.now(timezone.utc).timestamp() * 1000000)}",
        company_id=company_id,
        recurrence_id=rec.id,
        period=period,
        due_date=period,
        amount=_d(rec.amount),
        status="skipped",
    ))
    db.commit()
    return {"status": "skipped", "recurrence_id": rec.id, "period": period}


def history(db: Session, company_id: str, recurrence_id: str) -> list[dict]:
    rows = (
        db.query(RecurrenceOccurrence)
        .filter(RecurrenceOccurrence.company_id == company_id,
                RecurrenceOccurrence.recurrence_id == recurrence_id)
        .order_by(RecurrenceOccurrence.due_date.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "period": r.period,
            "due_date": r.due_date,
            "amount": float(_d(r.amount)),
            "status": r.status,
            "transaction_id": r.transaction_id,
        }
        for r in rows
    ]


def upcoming(db: Session, company_id: str, days: int = 60) -> list[dict]:
    """What is coming and has not been booked yet — the forecast side."""
    today = date.today()
    horizon = date.fromordinal(today.toordinal() + days)
    out = []
    for rec in (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id, Recurrence.active.isnot(False))
        .all()
    ):
        done = _existing_periods(db, rec.id)
        for due in occurrences_due(rec, horizon):
            if due < today:
                continue
            key = period_key(rec.frequency, due)
            if key in done:
                continue
            out.append({
                "recurrence_id": rec.id,
                "name": rec.name,
                "type": rec.type,
                "period": key,
                "due_date": due.isoformat(),
                "amount": float(_d(rec.amount)),
                "entity_name": rec.entity_name,
                "category_name": rec.category_name,
            })
    return sorted(out, key=lambda x: x["due_date"])
