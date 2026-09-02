"""The dashboard's numbers.

Results and margins are computed **net of VAT** and the cash balance from
actual payments — see app/services/financials.py for why those two
distinctions are not cosmetic. Before that, this module summed the gross
amount and called the difference a cash balance, which overstated revenue by
the VAT rate and described money that had not necessarily moved.
"""

from datetime import datetime, timedelta
from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Transaction
from app.services import financials


def _to_float(val) -> float:
    if val is None:
        return 0.0
    return float(val)


def _expense_totals_by_category(db: Session, company_id: str, start: str, end: str) -> list:
    """Expenses per category for a period, net of VAT and honouring lines.

    A line-level category wins over the document's, because that is the whole
    point of detailing an invoice by lines: the cleaning products do not become
    electricity just because they arrived on the same paper.
    """
    from app.models.models import TransactionLine

    rows = financials.documents_in_period(db, company_id, start, end, "expense")
    if not rows:
        return []

    by_transaction = {t.id: t for t in rows}
    lines = (
        db.query(TransactionLine)
        .filter(TransactionLine.company_id == company_id,
                TransactionLine.transaction_id.in_(list(by_transaction)))
        .all()
    )
    detailed = {line.transaction_id for line in lines}

    totals: dict = {}
    for line in lines:
        parent = by_transaction[line.transaction_id]
        name = line.category_name or parent.category_name or "Sem categoria"
        totals[name] = totals.get(name, 0.0) + float(financials.d(line.net_amount))

    for trx in rows:
        if trx.id in detailed:
            continue
        name = trx.category_name or "Sem categoria"
        totals[name] = totals.get(name, 0.0) + float(financials.net_of(trx))

    return sorted(
        ({"name": name, "amount": round(amount, 2)} for name, amount in totals.items()),
        key=lambda row: row["amount"],
        reverse=True,
    )


def calculate_health_score(company_id: str, db: Session) -> dict:
    """Calculate real-time financial health from actual transaction data."""
    today = datetime.utcnow().date()
    current_month_start = today.replace(day=1)

    next_month_start = (current_month_start + timedelta(days=32)).replace(day=1)

    # ── The month's result: documents dated in it, net of VAT ──
    month = financials.period_result(
        db, company_id, current_month_start.isoformat(), next_month_start.isoformat(),
    )
    month_income = month["rendimentos"]
    month_expense = month["gastos"]
    monthly_result = month["resultado"]
    operating_margin = month["margem"]

    # ── Cash: what the accounts actually hold, from payments ──
    cash = financials.cash_position(db, company_id)
    current_balance = cash["saldo"]

    # ── Burn rate (average monthly expense, last 3 months) ──
    three_months_ago = (today - timedelta(days=90)).isoformat()
    last_quarter = financials.period_result(
        db, company_id, three_months_ago, next_month_start.isoformat(),
    )
    burn_rate = round(last_quarter["gastos"] / 3, 2) if last_quarter["gastos"] > 0 else 0

    # ── Runway (months of cash remaining) ──
    runway_months = round(current_balance / burn_rate, 1) if burn_rate > 0 else 99

    # ── Previous month comparison ──
    prev_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
    previous = financials.period_result(
        db, company_id, prev_month_start.isoformat(), current_month_start.isoformat(),
    )
    prev_income = previous["rendimentos"]
    prev_expense = previous["gastos"]

    balance_trend = round(((month_income - prev_income) / prev_income * 100) if prev_income > 0 else 0, 1)

    # ── Overdue invoices ──
    overdue_payables = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "expense",
            Transaction.due_date < today.isoformat(),
            Transaction.payment_status.in_(["pending", "partially_paid"]),
            Transaction.status.notin_(["cancelled"]),
        )
        .all()
    )

    overdue_receivables = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "income",
            Transaction.due_date < today.isoformat(),
            Transaction.payment_status.in_(["pending", "partially_paid"]),
            Transaction.status.notin_(["cancelled"]),
        )
        .all()
    )

    # A read no longer writes. This used to insert FinancialEvent rows on
    # every dashboard load — stored warnings that outlived the problem and had
    # to be cleared by hand. app/services/alerts.py computes them live instead.

    # ── Upcoming (Future 30 days) ──
    thirty_days_ahead = (today + timedelta(days=30)).isoformat()
    upcoming_payables = (
        db.query(func.coalesce(func.sum(Transaction.outstanding_amount), 0))
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "expense",
            Transaction.due_date >= today.isoformat(),
            Transaction.due_date <= thirty_days_ahead,
            Transaction.payment_status.in_(["pending", "partially_paid"]),
            Transaction.status.notin_(["cancelled"]),
        )
        .scalar()
    )

    upcoming_receivables = (
        db.query(func.coalesce(func.sum(Transaction.outstanding_amount), 0))
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "income",
            Transaction.due_date >= today.isoformat(),
            Transaction.due_date <= thirty_days_ahead,
            Transaction.payment_status.in_(["pending", "partially_paid"]),
            Transaction.status.notin_(["cancelled"]),
        )
        .scalar()
    )

    # ── Top expense categories this month, net of VAT ──
    top_categories = _expense_totals_by_category(
        db, company_id, current_month_start.isoformat(), next_month_start.isoformat(),
    )[:5]

    # ── Calculate sub-scores ──
    # Liquidity: based on runway months (>12 = 100, <1 = 10)
    liquidity_score = min(100, max(10, int(runway_months * 12.5))) if runway_months < 99 else 100

    # Profitability: based on operating margin
    profitability_score = min(100, max(10, int(operating_margin * 2 + 30))) if operating_margin > -50 else 10

    # Cost control: based on expense trend vs previous month
    expense_change = ((month_expense - prev_expense) / prev_expense * 100) if prev_expense > 0 else 0
    cost_control_score = min(100, max(10, int(100 - abs(expense_change))))

    # Predictability: based on how many transactions are recurring
    total_trx_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= current_month_start.isoformat(),
        )
        .scalar()
    ) or 1
    recurring_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= current_month_start.isoformat(),
            Transaction.is_recurring == True,
        )
        .scalar()
    ) or 0
    predictability_score = min(100, max(30, int(recurring_count / total_trx_count * 100 + 40)))

    # ── Overall score (weighted average) ──
    score = int(
        liquidity_score * 0.30
        + profitability_score * 0.25
        + cost_control_score * 0.25
        + predictability_score * 0.20
    )

    # ── Status label ──
    if score >= 85:
        status_label = "Excelente"
    elif score >= 70:
        status_label = "Bom"
    elif score >= 50:
        status_label = "Atenção"
    else:
        status_label = "Crítico"

    # ── Key insights (dynamic) ──
    key_insights: List[dict] = []

    if overdue_payables:
        total_overdue = sum(_to_float(t.outstanding_amount or t.amount) for t in overdue_payables)
        key_insights.append({
            "type": "danger",
            "text": f"{len(overdue_payables)} fatura(s) a pagar vencida(s) (€{total_overdue:,.2f})"
        })

    if overdue_receivables:
        total_overdue_recv = sum(_to_float(t.outstanding_amount or t.amount) for t in overdue_receivables)
        key_insights.append({
            "type": "warning",
            "text": f"{len(overdue_receivables)} fatura(s) a receber vencida(s) (€{total_overdue_recv:,.2f})"
        })

    if operating_margin > 20:
        key_insights.append({
            "type": "success",
            "text": f"Margem operacional forte em {operating_margin}% este mês"
        })
    elif operating_margin < 0:
        key_insights.append({
            "type": "danger",
            "text": f"Margem operacional negativa em {operating_margin}% — despesas excedem receitas"
        })

    if top_categories:
        top_cat_name = top_categories[0]["name"]
        top_cat_val = top_categories[0]["amount"]
        key_insights.append({
            "type": "info",
            "text": f"Maior despesa: {top_cat_name} (€{top_cat_val:,.2f})"
        })

    if runway_months < 3 and runway_months < 99:
        key_insights.append({
            "type": "danger",
            "text": f"Runway crítico: apenas {runway_months} meses de caixa restantes"
        })
    elif runway_months >= 6:
        key_insights.append({
            "type": "success",
            "text": f"Runway saudável com {runway_months} meses de cobertura"
        })

    # ── AI explanations ──
    ai_explanation = [
        f"Saldo em conta: €{current_balance:,.2f} — soma dos pagamentos e recebimentos reais.",
        f"Gasto médio mensal (3 meses): €{burn_rate:,.2f}, sem IVA.",
        f"Margem operacional do mês: {operating_margin}%.",
        f"Resultado do mês (rendimentos menos gastos, sem IVA): €{monthly_result:,.2f}.",
    ]
    if balance_trend != 0:
        direction = "acima" if balance_trend > 0 else "abaixo"
        ai_explanation.append(f"Receita {direction} do mês anterior ({balance_trend:+.1f}%).")

    return {
        "score": score,
        "trend": balance_trend,
        "status_label": status_label,
        "liquidity_score": liquidity_score,
        "profitability_score": profitability_score,
        "cost_control_score": cost_control_score,
        "predictability_score": predictability_score,
        "runway_months": runway_months,
        "burn_rate": burn_rate,
        "operating_margin": operating_margin,
        "current_balance": round(current_balance, 2),
        "monthly_result": round(monthly_result, 2),
        "month_income": round(month_income, 2),
        "month_expense": round(month_expense, 2),
        "upcoming_payables": round(_to_float(upcoming_payables), 2),
        "upcoming_receivables": round(_to_float(upcoming_receivables), 2),
        "ai_explanation": ai_explanation,
        "key_insights": key_insights,
    }


def get_monthly_summary(company_id: str, db: Session, months: int = 6) -> list:
    """Income, expense and result per month — net of VAT, on the accrual basis."""
    today = datetime.utcnow().date()
    month_names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    results = []

    for i in range(months - 1, -1, -1):
        year, month = today.year, today.month - i
        while month <= 0:
            month += 12
            year -= 1

        start = datetime(year, month, 1).date()
        end = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)).date()
        period = financials.period_result(db, company_id, start.isoformat(), end.isoformat())

        results.append({
            "month": month_names[start.month - 1],
            "Entradas": round(period["rendimentos"], 2),
            "Saídas": round(period["gastos"], 2),
            "Resultado": round(period["resultado"], 2),
        })

    return results


def get_expenses_by_category(company_id: str, db: Session) -> list:
    """Expense breakdown for the current month, net of VAT."""
    today = datetime.utcnow().date()
    start = today.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)

    rows = _expense_totals_by_category(db, company_id, start.isoformat(), end.isoformat())
    if not rows:
        return []

    grand_total = sum(row["amount"] for row in rows)
    colors = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#94A3B8"]

    return [
        {
            "name": row["name"],
            "value": round(row["amount"] / grand_total * 100, 1) if grand_total > 0 else 0,
            "amount": row["amount"],
            "color": colors[index % len(colors)],
        }
        for index, row in enumerate(rows)
    ]
