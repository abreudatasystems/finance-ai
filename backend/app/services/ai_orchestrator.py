from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.schemas.schemas import AIChatRequest, AIChatResponse, AIChatAction
from app.models.models import Transaction, Category, Supplier, Customer


def _to_float(val) -> float:
    if val is None:
        return 0.0
    return float(val)


def _currency_symbol(currency: str) -> str:
    return {"EUR": "€", "USD": "$", "BRL": "R$", "GBP": "£"}.get(currency, "€")


async def process_ai_intent_and_action(
    request: AIChatRequest,
    db: Session,
    company_id: str,
) -> AIChatResponse:
    prompt = (request.message or request.prompt or "").strip()
    lower = prompt.lower()
    timestamp = datetime.utcnow().strftime("%H:%M")
    page_context = request.context.page if request.context else "dashboard"
    cs = _currency_symbol(request.currency)
    today = datetime.utcnow().date()
    month_start = today.replace(day=1).isoformat()

    # ── Intent: spending query (quanto gastei, despesas, gastos) ──
    spending_keywords = ["gastei", "despesas", "gastos", "gasto", "quanto", "custos"]
    if any(k in lower for k in spending_keywords):
        # Try to detect a category or entity keyword
        search_term = None
        for word in ["marketing", "software", "google", "microsoft", "salários",
                      "salarios", "pessoal", "energia", "cloud", "adobe", "edp",
                      "escritório", "aluguel", "licenças", "saas"]:
            if word in lower:
                search_term = word
                break

        query = (
            db.query(
                Transaction.category_name,
                Transaction.entity_name,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .filter(
                Transaction.company_id == company_id,
                Transaction.type == "expense",
                Transaction.date >= month_start,
                Transaction.status.notin_(["cancelled", "draft"]),
            )
        )

        if search_term:
            query = query.filter(
                (Transaction.category_name.ilike(f"%{search_term}%"))
                | (Transaction.entity_name.ilike(f"%{search_term}%"))
                | (Transaction.description.ilike(f"%{search_term}%"))
            )

        rows = (
            query
            .group_by(Transaction.entity_name, Transaction.category_name)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(10)
            .all()
        )

        if rows:
            grand_total = sum(_to_float(r.total) for r in rows)
            lines = [f"**Total: {cs}{grand_total:,.2f}** ({sum(r.count for r in rows)} movimentos)\n"]
            for r in rows[:5]:
                lines.append(f"• {r.entity_name} ({r.category_name}): {cs}{_to_float(r.total):,.2f}")

            title = f"Despesas com '{search_term}'" if search_term else "Despesas do Mês"
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"Analisando **{title}** (mês atual):\n\n" + "\n".join(lines),
                type="analysis",
                timestamp=timestamp,
                actions=[
                    AIChatAction(label="Ver movimentos", action="open_transactions",
                                 payload={"category": search_term}),
                    AIChatAction(label="Exportar relatório", action="create_report",
                                 payload={"module": search_term or "all"}),
                ],
            )
        else:
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"Não encontrei despesas"
                     + (f" relacionadas com **{search_term}**" if search_term else "")
                     + " neste mês. Verifique o período ou tente outro termo.",
                type="analysis",
                timestamp=timestamp,
            )

    # ── Intent: pay invoice / fatura ──
    if any(k in lower for k in ["paga", "pagar", "fatura", "liquidar"]):
        # Find pending invoices matching entity keyword
        entity_filter = None
        for word in lower.split():
            if len(word) > 3 and word not in ["pagar", "fatura", "quero", "como", "esta", "para"]:
                entity_filter = word
                break

        pending_q = (
            db.query(Transaction)
            .filter(
                Transaction.company_id == company_id,
                Transaction.type == "expense",
                Transaction.payment_status.in_(["pending", "partially_paid"]),
                Transaction.status.notin_(["cancelled"]),
            )
        )
        if entity_filter:
            pending_q = pending_q.filter(
                (Transaction.entity_name.ilike(f"%{entity_filter}%"))
                | (Transaction.description.ilike(f"%{entity_filter}%"))
            )

        pending = pending_q.order_by(Transaction.due_date).limit(5).all()

        if pending:
            trx = pending[0]
            amount = _to_float(trx.outstanding_amount or trx.amount)
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"Encontrei {len(pending)} fatura(s) pendente(s):\n\n"
                     f"• **Fornecedor**: {trx.entity_name}\n"
                     f"• **Descrição**: {trx.description}\n"
                     f"• **Valor em aberto**: **{cs}{amount:,.2f}**\n"
                     f"• **Vencimento**: {trx.due_date or 'N/A'}",
                type="action",
                timestamp=timestamp,
                actionCard={
                    "type": "create_transaction",
                    "title": "Confirmar Pagamento de Fatura",
                    "status": "pending",
                    "data": {
                        "transaction_id": trx.id,
                        "supplier": trx.entity_name,
                        "description": trx.description,
                        "category": trx.category_name,
                        "amount": amount,
                        "due_date": trx.due_date,
                        "currencySymbol": cs,
                    },
                },
                actions=[
                    AIChatAction(label="Confirmar pagamento", action="confirm_payment",
                                 payload={"transaction_id": trx.id, "amount": amount}),
                    AIChatAction(label="Ver todas pendentes", action="open_transactions",
                                 payload={"status": "pending"}),
                ],
            )
        else:
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text="Não encontrei faturas pendentes de pagamento"
                     + (f" para **{entity_filter}**" if entity_filter else "")
                     + ". Todas as faturas estão liquidadas! ✅",
                type="analysis",
                timestamp=timestamp,
            )

    # ── Intent: create category ──
    if any(k in lower for k in ["categoria", "criar categoria", "nova categoria"]):
        existing = db.query(Category).filter(Category.company_id == company_id).count()
        return AIChatResponse(
            id=f"msg-{int(datetime.utcnow().timestamp())}",
            sender="ai",
            text=f"A empresa tem atualmente **{existing} categorias** configuradas.\n\n"
                 f"Para criar uma nova categoria, indique:\n"
                 f"• **Nome** da categoria\n"
                 f"• **Tipo**: receita ou despesa\n"
                 f"• **Palavras-chave** para auto-classificação",
            type="action",
            timestamp=timestamp,
            actions=[
                AIChatAction(label="Criar categoria", action="create_category"),
                AIChatAction(label="Ver categorias", action="open_categories"),
            ],
        )

    # ── Intent: summary / balance / flow ──
    if any(k in lower for k in ["resumo", "saldo", "fluxo", "balanço", "balanco", "como estamos",
                                  "saúde", "saude", "situação", "situacao"]):
        # Real-time summary
        month_totals = (
            db.query(
                Transaction.type,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .filter(
                Transaction.company_id == company_id,
                Transaction.date >= month_start,
                Transaction.status.notin_(["cancelled", "draft"]),
            )
            .group_by(Transaction.type)
            .all()
        )
        income = 0.0
        expense = 0.0
        for row in month_totals:
            if row.type == "income":
                income = _to_float(row.total)
            elif row.type == "expense":
                expense = _to_float(row.total)

        balance = income - expense

        # Overall balance
        all_totals = (
            db.query(
                Transaction.type,
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            )
            .filter(
                Transaction.company_id == company_id,
                Transaction.status.notin_(["cancelled", "draft"]),
            )
            .group_by(Transaction.type)
            .all()
        )
        all_income = 0.0
        all_expense = 0.0
        for row in all_totals:
            if row.type == "income":
                all_income = _to_float(row.total)
            elif row.type == "expense":
                all_expense = _to_float(row.total)

        total_balance = all_income - all_expense

        # Pending count
        pending_count = (
            db.query(func.count(Transaction.id))
            .filter(
                Transaction.company_id == company_id,
                Transaction.payment_status.in_(["pending", "partially_paid"]),
                Transaction.status.notin_(["cancelled"]),
            )
            .scalar()
        ) or 0

        return AIChatResponse(
            id=f"msg-{int(datetime.utcnow().timestamp())}",
            sender="ai",
            text=f"📊 **Resumo Financeiro** (dados em tempo real):\n\n"
                 f"• **Saldo total**: {cs}{total_balance:,.2f}\n"
                 f"• **Receitas do mês**: {cs}{income:,.2f}\n"
                 f"• **Despesas do mês**: {cs}{expense:,.2f}\n"
                 f"• **Resultado do mês**: {cs}{balance:,.2f}\n"
                 f"• **Faturas pendentes**: {pending_count}",
            type="analysis",
            timestamp=timestamp,
            actions=[
                AIChatAction(label="Ver fluxo de caixa", action="open_transactions"),
                AIChatAction(label="Diagnóstico completo", action="analyze_cashflow"),
            ],
        )

    # ── Intent: suppliers / customers info ──
    if any(k in lower for k in ["fornecedor", "fornecedores", "cliente", "clientes"]):
        if "cliente" in lower:
            count = db.query(func.count(Customer.id)).filter(Customer.company_id == company_id).scalar() or 0
            total_rev = (
                db.query(func.coalesce(func.sum(Transaction.amount), 0))
                .filter(Transaction.company_id == company_id, Transaction.type == "income")
                .scalar()
            )
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"A empresa tem **{count} clientes** registados com receita total de **{cs}{_to_float(total_rev):,.2f}**.",
                type="analysis",
                timestamp=timestamp,
                actions=[AIChatAction(label="Ver clientes", action="open_customers")],
            )
        else:
            count = db.query(func.count(Supplier.id)).filter(Supplier.company_id == company_id).scalar() or 0
            total_spent = (
                db.query(func.coalesce(func.sum(Transaction.amount), 0))
                .filter(Transaction.company_id == company_id, Transaction.type == "expense")
                .scalar()
            )
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"A empresa tem **{count} fornecedores** registados com despesa total de **{cs}{_to_float(total_spent):,.2f}**.",
                type="analysis",
                timestamp=timestamp,
                actions=[AIChatAction(label="Ver fornecedores", action="open_suppliers")],
            )

    # ── Default: general financial overview ──
    trx_count = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.company_id == company_id)
        .scalar()
    ) or 0

    return AIChatResponse(
        id=f"msg-{int(datetime.utcnow().timestamp())}",
        sender="ai",
        text=f"Processado pela **Finance AI Engine**: *\"{prompt}\"*.\n\n"
             f"Base de dados com **{trx_count} transações** registadas. "
             f"Contexto de navegação: {page_context}.\n\n"
             f"Experimente perguntar:\n"
             f"• \"Quanto gastei com marketing?\"\n"
             f"• \"Qual o meu saldo?\"\n"
             f"• \"Pagar fatura Microsoft\"\n"
             f"• \"Resumo financeiro\"",
        type="analysis",
        timestamp=timestamp,
        actions=[
            AIChatAction(label="Ver resumo", action="analyze_cashflow"),
            AIChatAction(label="Alertas", action="show_alerts"),
        ],
    )
