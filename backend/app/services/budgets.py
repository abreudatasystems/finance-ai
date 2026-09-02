"""Orçamento face ao realizado.

The product could say what happened (the income statement) and what is coming
(the forecast), and nothing about what was *intended*. Without that, a month
can only be compared against the month before — which tells you whether things
changed, never whether they went well. A budget is the decision written down,
and the comparison is the only way a small company finds out it is losing money
on something it chose to spend on.

Two rules keep the report honest:

**Only the plan is stored.** The realizado is derived from the documents dated
in the period, on the same accrual, net-of-VAT basis as the income statement,
so the budget report and the DRE can never disagree about the same month.

**A deviation has a direction, and the direction depends on the nature.**
Spending less than planned is good; earning less than planned is not. A single
signed number would read backwards on half the rows, so the sign is resolved
here and the report says *favorável* or *desfavorável* in words.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Budget, Category
from app.services import financials

CENTS = Decimal("0.01")


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def parse_period(period: str) -> tuple[str, str]:
    """AAAA-MM → the [start, end) the documents of that month fall in."""
    try:
        year, month = period.split("-")
        start = date(int(year), int(month), 1)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail=f"Período inválido: '{period}'. Use AAAA-MM, por exemplo 2026-09.",
        )
    last = calendar.monthrange(start.year, start.month)[1]
    # Exclusive end, so a document dated on the last day of the month counts.
    end = date(start.year, start.month, last) + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def current_period(today: Optional[date] = None) -> str:
    today = today or date.today()
    return f"{today.year:04d}-{today.month:02d}"


def next_period(period: str) -> str:
    year, month = (int(p) for p in period.split("-"))
    return f"{year + 1:04d}-01" if month == 12 else f"{year:04d}-{month + 1:02d}"


# ---------------------------------------------------------------------------
# The plan
# ---------------------------------------------------------------------------

def _scoped_category(db: Session, company_id: str, category_id: str) -> Category:
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.company_id == company_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return category


def serialize(budget: Budget) -> dict:
    return {
        "id": budget.id,
        "category_id": budget.category_id,
        "categoria": budget.category_name,
        "tipo": budget.type,
        "periodo": budget.period,
        "valor": float(_d(budget.amount)),
        "notas": budget.notes,
    }


def set_budget(db: Session, company_id: str, category_id: str, period: str,
               amount, notes: Optional[str] = None,
               created_by: Optional[str] = None) -> dict:
    """Plan a category for a month, or change the plan already there.

    One budget per category per month: a second one would be a second opinion,
    and the report would have to guess which is the plan.
    """
    parse_period(period)
    category = _scoped_category(db, company_id, category_id)
    value = _d(amount)
    if value < 0:
        raise HTTPException(status_code=400, detail="O valor do orçamento não pode ser negativo.")

    existing = (
        db.query(Budget)
        .filter(Budget.company_id == company_id,
                Budget.category_id == category_id,
                Budget.period == period)
        .first()
    )
    if existing:
        existing.amount = value
        existing.category_name = category.name
        existing.type = category.type
        if notes is not None:
            existing.notes = notes
        db.commit()
        db.refresh(existing)
        return serialize(existing)

    budget = Budget(
        id=f"BUD-{int(datetime.now(timezone.utc).timestamp() * 1000000)}",
        company_id=company_id,
        category_id=category_id,
        category_name=category.name,
        type=category.type or "expense",
        period=period,
        amount=value,
        notes=notes,
        created_by=created_by,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return serialize(budget)


def remove(db: Session, company_id: str, budget_id: str) -> dict:
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.company_id == company_id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    db.delete(budget)
    db.commit()
    return {"status": "success", "deleted_id": budget_id}


def copy_period(db: Session, company_id: str, source: str, target: str,
                created_by: Optional[str] = None) -> dict:
    """Carry a month's plan into another one.

    Most months are the previous month with a couple of changes, and retyping
    twenty categories is how budgeting stops happening. Categories already
    planned in the target are left alone: an existing decision is not
    overwritten by an older one.
    """
    parse_period(source)
    parse_period(target)
    if source == target:
        raise HTTPException(status_code=400, detail="Escolha um período de destino diferente.")

    rows = db.query(Budget).filter(
        Budget.company_id == company_id, Budget.period == source,
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"Não há orçamento em {source} para copiar.")

    taken = {
        b.category_id for b in db.query(Budget).filter(
            Budget.company_id == company_id, Budget.period == target,
        ).all()
    }

    created = 0
    for index, row in enumerate(rows):
        if row.category_id in taken:
            continue
        db.add(Budget(
            id=f"BUD-{int(datetime.now(timezone.utc).timestamp() * 1000000)}-{index}",
            company_id=company_id,
            category_id=row.category_id,
            category_name=row.category_name,
            type=row.type,
            period=target,
            amount=row.amount,
            notes=row.notes,
            created_by=created_by,
        ))
        created += 1
    db.commit()

    return {
        "status": "success",
        "origem": source,
        "destino": target,
        "copiados": created,
        "ignorados": len(rows) - created,
    }


# ---------------------------------------------------------------------------
# The comparison
# ---------------------------------------------------------------------------

def _realised_by_category(db: Session, company_id: str, start: str, end: str) -> dict:
    """Net-of-VAT totals per category for the documents dated in the period.

    Same basis as the income statement — accrual, net — so the two reports
    cannot tell different stories about the same month. Line-level categories
    win over the document's own when a document is detailed by lines.
    """
    rows = financials.documents_in_period(db, company_id, start, end)
    nets = financials.line_net_totals(db, company_id, [t.id for t in rows])

    totals: dict = {}
    for trx in rows:
        key = trx.category_id or "sem-categoria"
        entry = totals.setdefault(key, {
            "categoria": trx.category_name or "Sem categoria",
            "tipo": trx.type,
            "valor": Decimal("0.00"),
            "documentos": 0,
        })
        entry["valor"] += financials.net_of(trx, nets)
        entry["documentos"] += 1
    return totals


def _deviation(planned: Decimal, actual: Decimal, kind: str) -> dict:
    """The gap, and whether it is good news.

    Spending less than planned is favourable; earning less is not. Resolving
    the direction here is the difference between a report a person can read and
    one they have to reason about row by row.
    """
    gap = (actual - planned).quantize(CENTS, rounding=ROUND_HALF_UP)
    if kind == "income":
        favourable = gap >= 0        # more revenue than planned
    else:
        favourable = gap <= 0        # less cost than planned

    percent = None
    if planned > 0:
        percent = float((gap / planned * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))

    return {
        "desvio": float(gap),
        "desvio_pct": percent,
        "sentido": "favorável" if favourable else "desfavorável",
        # Nothing planned and nothing spent is not a deviation worth colouring.
        "relevante": bool(planned or actual),
    }


def compare(db: Session, company_id: str, period: str) -> dict:
    """Plan against reality for one month, category by category."""
    start, end = parse_period(period)

    plans = db.query(Budget).filter(
        Budget.company_id == company_id, Budget.period == period,
    ).all()
    realised = _realised_by_category(db, company_id, start, end)

    # The report doubles as the sheet the budget is filled in on, so the
    # company's own top-level categories are always rows: a month with nothing
    # in it yet must still be plannable. Subcategories appear once they carry a
    # plan or a movement, which keeps the sheet short enough to fill in.
    headings = {
        c.id: c for c in db.query(Category).filter(
            Category.company_id == company_id,
            Category.parent_id.is_(None),
            Category.active.isnot(False),
        ).all()
    }

    keys = {b.category_id for b in plans} | set(realised.keys()) | set(headings)
    by_plan = {b.category_id: b for b in plans}

    lines = []
    for key in keys:
        plan = by_plan.get(key)
        actual_entry = realised.get(key)
        heading = headings.get(key)
        planned = _d(plan.amount) if plan else Decimal("0.00")
        actual = actual_entry["valor"] if actual_entry else Decimal("0.00")
        kind = (
            plan.type if plan
            else actual_entry["tipo"] if actual_entry
            else heading.type
        ) or "expense"
        name = (
            plan.category_name if plan
            else actual_entry["categoria"] if actual_entry
            else heading.name
        )

        lines.append({
            "budget_id": plan.id if plan else None,
            "category_id": key,
            "categoria": name,
            "tipo": kind,
            "orcamento": float(planned),
            "realizado": float(actual),
            "documentos": actual_entry["documentos"] if actual_entry else 0,
            # A category spent on but never planned is the finding a budget
            # report exists to surface. An untouched heading is just an empty
            # line waiting to be filled in.
            "sem_orcamento": plan is None and actual > 0,
            **_deviation(planned, actual, kind),
        })

    # Revenue first, then by how far off it is; untouched rows fall to the end.
    lines.sort(key=lambda row: (row["tipo"] != "income", not row["relevante"],
                                -abs(row["desvio"])))

    def totals_for(kind: str) -> dict:
        rows = [line for line in lines if line["tipo"] == kind]
        planned = sum((_d(r["orcamento"]) for r in rows), Decimal("0.00"))
        actual = sum((_d(r["realizado"]) for r in rows), Decimal("0.00"))
        return {
            "orcamento": float(planned),
            "realizado": float(actual),
            **_deviation(planned, actual, kind),
        }

    revenue, cost = totals_for("income"), totals_for("expense")
    planned_result = _d(revenue["orcamento"]) - _d(cost["orcamento"])
    actual_result = _d(revenue["realizado"]) - _d(cost["realizado"])

    return {
        "periodo": period,
        "inicio": start,
        "fim": end,
        "linhas": lines,
        "rendimentos": revenue,
        "gastos": cost,
        "resultado": {
            "orcamento": float(planned_result),
            "realizado": float(actual_result),
            **_deviation(planned_result, actual_result, "income"),
        },
        "sem_orcamento": not plans,
        "mensagem": _message(plans, lines, planned_result, actual_result),
    }


def _message(plans: list, lines: list, planned_result: Decimal,
             actual_result: Decimal) -> str:
    if not plans:
        return (
            "Ainda não há orçamento para este mês. Defina o que espera gastar "
            "em cada categoria, sem IVA — é a base em que o realizado é medido."
        )

    unplanned = [line for line in lines if line["sem_orcamento"] and line["realizado"] > 0]
    worst = next(
        (line for line in lines
         if line["sentido"] == "desfavorável" and line["relevante"] and line["orcamento"] > 0),
        None,
    )

    parts = []
    gap = actual_result - planned_result
    if gap >= 0:
        parts.append(
            f"O resultado do mês está {float(gap):,.2f} € acima do orçamentado."
        )
    else:
        parts.append(
            f"O resultado do mês está {abs(float(gap)):,.2f} € abaixo do orçamentado."
        )
    if worst:
        parts.append(
            f"O maior desvio é em {worst['categoria']}: {worst['realizado']:,.2f} € "
            f"contra {worst['orcamento']:,.2f} € previstos."
        )
    if unplanned:
        total = sum(line["realizado"] for line in unplanned)
        parts.append(
            f"Há ainda {float(total):,.2f} € em {len(unplanned)} categoria(s) "
            "sem orçamento nenhum."
        )
    return " ".join(parts)


def year(db: Session, company_id: str, year_number: int) -> dict:
    """Twelve months side by side — where the plan holds and where it slips."""
    months = []
    for month in range(1, 13):
        period = f"{year_number:04d}-{month:02d}"
        start, end = parse_period(period)
        plans = db.query(Budget).filter(
            Budget.company_id == company_id, Budget.period == period,
        ).all()
        realised = _realised_by_category(db, company_id, start, end)

        def side(kind: str) -> tuple[Decimal, Decimal]:
            planned = sum((_d(b.amount) for b in plans if b.type == kind), Decimal("0.00"))
            actual = sum((entry["valor"] for entry in realised.values() if entry["tipo"] == kind),
                         Decimal("0.00"))
            return planned, actual

        planned_in, actual_in = side("income")
        planned_out, actual_out = side("expense")

        months.append({
            "periodo": period,
            "mes": month,
            "rendimentos": {"orcamento": float(planned_in), "realizado": float(actual_in)},
            "gastos": {"orcamento": float(planned_out), "realizado": float(actual_out)},
            "resultado": {
                "orcamento": float(planned_in - planned_out),
                "realizado": float(actual_in - actual_out),
            },
            "tem_orcamento": bool(plans),
        })

    return {"ano": year_number, "meses": months}
