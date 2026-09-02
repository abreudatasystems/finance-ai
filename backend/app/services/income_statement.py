"""Demonstração de Resultados por naturezas.

Two rules decide every figure here, and both come from
app/services/financials.py:

* **net of VAT** — an invoice of 1 000 € + 23% is revenue of 1 000 €. The VAT
  belongs to the State and is neither income nor expense;
* **accrual basis** — the period's result is made of the documents dated in
  it, paid or not. What was actually collected is the cash position, a
  different number with a different name, and it is shown beside the result so
  the gap between them is visible rather than confusing.

The statement always ties to the ledger: every movement lands on a line, and
anything whose category has no SNC account lands on a line that says so
instead of disappearing.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.catalog.income_statement import LINES, SUBTOTALS, UNMAPPED, line_for
from app.models.models import Category, Company, Transaction, TransactionLine
from app.services import financials
from app.services.vat_engine import resolve_period

CENTS = Decimal("0.01")


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _snc_by_category(db: Session, company_id: str) -> dict:
    """Category id -> SNC account, inheriting the parent's when it has none."""
    categories = db.query(Category).filter(Category.company_id == company_id).all()
    by_id = {c.id: c for c in categories}
    out = {}
    for category in categories:
        code = category.snc_code
        if not code and category.parent_id:
            parent = by_id.get(category.parent_id)
            code = parent.snc_code if parent else None
        out[category.id] = code
    return out


def _contributions(db: Session, company_id: str, start: str, end: str) -> tuple[dict, dict]:
    """Net amount per statement line, plus the categories behind each one.

    A document detailed by lines is read line by line, because a line carries
    its own category — and therefore its own SNC account. Cleaning products do
    not become electricity just because they arrived on the same invoice.
    """
    documents = financials.documents_in_period(db, company_id, start, end)
    if not documents:
        return {}, {}

    snc = _snc_by_category(db, company_id)
    by_id = {t.id: t for t in documents}
    lines = (
        db.query(TransactionLine)
        .filter(TransactionLine.company_id == company_id,
                TransactionLine.transaction_id.in_(list(by_id)))
        .all()
    )
    detailed = {line.transaction_id for line in lines}

    totals: dict = {}
    detail: dict = {}

    def add(key: str, label: str, amount: Decimal, category: str) -> None:
        totals[key] = totals.get(key, Decimal("0.00")) + amount
        bucket = detail.setdefault(key, {})
        bucket[category] = bucket.get(category, Decimal("0.00")) + amount

    for line in lines:
        parent = by_id[line.transaction_id]
        category_id = line.category_id or parent.category_id
        statement_line = line_for(snc.get(category_id), parent.type)
        add(statement_line.key, statement_line.label, _d(line.net_amount),
            line.category_name or parent.category_name or "Sem categoria")

    for trx in documents:
        if trx.id in detailed:
            continue
        statement_line = line_for(snc.get(trx.category_id), trx.type)
        add(statement_line.key, statement_line.label, financials.net_of(trx),
            trx.category_name or "Sem categoria")

    return totals, detail


def _statement_for(db: Session, company_id: str, start: str, end: str) -> dict:
    """The lines and subtotals for one period."""
    totals, detail = _contributions(db, company_id, start, end)

    values: dict = {}
    rows = []
    for line in (*LINES, UNMAPPED):
        amount = totals.get(line.key, Decimal("0.00"))
        values[line.key] = amount
        if amount == 0 and line.key == UNMAPPED.key:
            continue                      # do not show a warning that does not apply
        rows.append({
            "key": line.key,
            "label": line.label,
            "nature": line.nature,
            "section": line.section,
            "hint": line.hint,
            "contas": list(line.accounts),
            "amount": float(amount),
            "detalhe": sorted(
                ({"categoria": name, "amount": float(value)}
                 for name, value in detail.get(line.key, {}).items()),
                key=lambda item: -item["amount"],
            ),
        })

    subtotals = []
    for subtotal in SUBTOTALS:
        amount = sum((values.get(k, Decimal("0.00")) for k in subtotal.adds), Decimal("0.00"))
        amount -= sum((values.get(k, Decimal("0.00")) for k in subtotal.subtracts), Decimal("0.00"))
        amount = amount.quantize(CENTS, rounding=ROUND_HALF_UP)
        values[subtotal.key] = amount
        subtotals.append({
            "key": subtotal.key,
            "label": subtotal.label,
            "amount": float(amount),
            "emphasis": subtotal.emphasis,
            "hint": subtotal.hint,
        })

    revenue = values.get("total_rendimentos", Decimal("0.00"))

    def margin(key: str) -> float:
        if revenue <= 0:
            return 0.0
        return float((values[key] / revenue * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))

    return {
        "linhas": rows,
        "subtotais": subtotals,
        "valores": {k: float(v) for k, v in values.items()},
        "margens": {
            "ebitda": margin("ebitda"),
            "operacional": margin("ebit"),
            "liquida": margin("resultado_liquido"),
        },
    }


def _previous_window(start: str, end: str) -> tuple[str, str]:
    """The equivalent window immediately before this one."""
    first = date.fromisoformat(start)
    last = date.fromisoformat(end)
    span = (last - first).days
    previous_end = first
    previous_start = date.fromordinal(first.toordinal() - span)
    return previous_start.isoformat(), previous_end.isoformat()


def build(db: Session, company_id: str, period: Optional[str] = None,
          today: Optional[date] = None) -> dict:
    """The statement, the comparison with the period before, and the cash bridge."""
    company = db.query(Company).filter(Company.id == company_id).first()
    periodicity = (company.vat_periodicity if company else "quarterly") or "quarterly"
    label, key, start, end = resolve_period(periodicity, period, today)

    current = _statement_for(db, company_id, start, end)
    prev_start, prev_end = _previous_window(start, end)
    previous = _statement_for(db, company_id, prev_start, prev_end)

    # Variation per line, so the reader sees movement rather than a snapshot.
    previous_values = previous["valores"]
    for row in current["linhas"]:
        before = previous_values.get(row["key"], 0.0)
        row["anterior"] = before
        row["variacao"] = round(row["amount"] - before, 2)
        row["variacao_pct"] = (
            round((row["amount"] - before) / abs(before) * 100, 1) if before else None
        )
    for row in current["subtotais"]:
        before = previous_values.get(row["key"], 0.0)
        row["anterior"] = before
        row["variacao"] = round(row["amount"] - before, 2)
        row["variacao_pct"] = (
            round((row["amount"] - before) / abs(before) * 100, 1) if before else None
        )

    cash = financials.cash_position(db, company_id, until=end)
    open_positions = financials.open_positions(db, company_id, (today or date.today()).isoformat())
    result = current["valores"]["resultado_liquido"]

    return {
        "empresa": {"nome": company.name if company else "", "nif": company.nif if company else ""},
        "periodo": {"label": label, "key": key, "inicio": start, "fim": end},
        "periodo_anterior": {"inicio": prev_start, "fim": prev_end},
        "linhas": current["linhas"],
        "subtotais": current["subtotais"],
        "margens": current["margens"],
        # The result is not the money in the bank, and this says why.
        "ponte_caixa": {
            "resultado": result,
            "saldo_em_conta": cash["saldo"],
            "a_receber": open_positions["a_receber"],
            "a_pagar": open_positions["a_pagar"],
            "explicacao": (
                "O resultado conta os documentos do período, pagos ou não. O saldo em "
                "conta conta o dinheiro que se moveu. A diferença está no que falta "
                "receber e no que falta pagar."
            ),
        },
        "base": {
            "regime": "acréscimo (documentos do período)",
            "iva": "valores sem IVA — o IVA não é rendimento nem gasto",
            "nota_irc": "O IRC não é apurado; o resultado líquido apresentado é antes desse imposto.",
        },
    }
