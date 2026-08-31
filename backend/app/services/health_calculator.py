from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import func, and_, case, extract
from sqlalchemy.orm import Session

from app.models.models import Transaction


def _to_float(val) -> float:
    if val is None:
        return 0.0
    return float(val)


def calculate_health_score(company_id: str, db: Session) -> dict:
    """Calculate real-time financial health from actual transaction data."""
    today = datetime.utcnow().date()
    current_month_start = today.replace(day=1)

    # ── Total income & expense (all time) ──
    totals = (
        db.query(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(Transaction.company_id == company_id)
        .filter(Transaction.status.notin_(["cancelled", "draft"]))
        .group_by(Transaction.type)
        .all()
    )
    total_income = 0.0
    total_expense = 0.0
    for row in totals:
        if row.type == "income":
            total_income = _to_float(row.total)
        elif row.type == "expense":
            total_expense = _to_float(row.total)

    current_balance = total_income - total_expense

    # ── Current month income & expense ──
    month_totals = (
        db.query(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= current_month_start.isoformat(),
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .group_by(Transaction.type)
        .all()
    )
    month_income = 0.0
    month_expense = 0.0
    for row in month_totals:
        if row.type == "income":
            month_income = _to_float(row.total)
        elif row.type == "expense":
            month_expense = _to_float(row.total)

    monthly_result = month_income - month_expense

    # ── Operating margin ──
    operating_margin = round((monthly_result / month_income * 100) if month_income > 0 else 0, 1)

    # ── Burn rate (average monthly expense, last 3 months) ──
    three_months_ago = (today - timedelta(days=90)).isoformat()
    burn_query = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "expense",
            Transaction.date >= three_months_ago,
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .scalar()
    )
    total_expense_3m = _to_float(burn_query)
    burn_rate = round(total_expense_3m / 3, 2) if total_expense_3m > 0 else 0

    # ── Runway (months of cash remaining) ──
    runway_months = round(current_balance / burn_rate, 1) if burn_rate > 0 else 99

    # ── Previous month comparison ──
    prev_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
    prev_month_end = current_month_start - timedelta(days=1)
    prev_month_totals = (
        db.query(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= prev_month_start.isoformat(),
            Transaction.date <= prev_month_end.isoformat(),
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .group_by(Transaction.type)
        .all()
    )
    prev_income = 0.0
    prev_expense = 0.0
    for row in prev_month_totals:
        if row.type == "income":
            prev_income = _to_float(row.total)
        elif row.type == "expense":
            prev_expense = _to_float(row.total)

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

    # ── Top expense categories this month ──
    top_categories = (
        db.query(
            Transaction.category_name,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "expense",
            Transaction.date >= current_month_start.isoformat(),
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .group_by(Transaction.category_name)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
        .all()
    )

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
        top_cat_name = top_categories[0].category_name or "Geral"
        top_cat_val = _to_float(top_categories[0].total)
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
        f"Saldo de caixa atual: €{current_balance:,.2f}.",
        f"Burn rate médio (3 meses): €{burn_rate:,.2f}/mês.",
        f"Margem operacional do mês: {operating_margin}%.",
        f"Resultado do mês corrente: €{monthly_result:,.2f}.",
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
        "ai_explanation": ai_explanation,
        "key_insights": key_insights,
    }


def get_monthly_summary(company_id: str, db: Session, months: int = 6) -> list:
    """Return income/expense/result per month for the last N months."""
    today = datetime.utcnow().date()
    results = []

    for i in range(months - 1, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1

        month_start = datetime(year, month, 1).date()
        if month == 12:
            month_end = datetime(year + 1, 1, 1).date() - timedelta(days=1)
        else:
            month_end = datetime(year, month + 1, 1).date() - timedelta(days=1)

        rows = (
            db.query(
                Transaction.type,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .filter(
                Transaction.company_id == company_id,
                Transaction.date >= month_start.isoformat(),
                Transaction.date <= month_end.isoformat(),
                Transaction.status.notin_(["cancelled", "draft"]),
            )
            .group_by(Transaction.type)
            .all()
        )

        income = 0.0
        expense = 0.0
        for row in rows:
            if row.type == "income":
                income = _to_float(row.total)
            elif row.type == "expense":
                expense = _to_float(row.total)

        month_names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        results.append({
            "month": month_names[month_start.month - 1],
            "Entradas": round(income, 2),
            "Saídas": round(expense, 2),
            "Resultado": round(income - expense, 2),
        })

    return results


def get_expenses_by_category(company_id: str, db: Session) -> list:
    """Return expense breakdown by category for the current month."""
    today = datetime.utcnow().date()
    month_start = today.replace(day=1)

    rows = (
        db.query(
            Transaction.category_name,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "expense",
            Transaction.date >= month_start.isoformat(),
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .group_by(Transaction.category_name)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )

    if not rows:
        return []

    grand_total = sum(_to_float(r.total) for r in rows)
    colors = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#94A3B8"]

    result = []
    for idx, row in enumerate(rows):
        val = _to_float(row.total)
        pct = round(val / grand_total * 100, 1) if grand_total > 0 else 0
        result.append({
            "name": row.category_name or "Sem Categoria",
            "value": pct,
            "amount": round(val, 2),
            "color": colors[idx % len(colors)],
        })

    return result
