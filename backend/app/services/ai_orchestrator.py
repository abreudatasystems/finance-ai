from datetime import datetime
from app.schemas.schemas import AIChatRequest, AIChatResponse, AIChatAction

async def process_ai_intent_and_action(request: AIChatRequest) -> AIChatResponse:
    prompt = (request.message or request.prompt or "").strip()
    lower = prompt.toLowerCase() if hasattr(prompt, "toLowerCase") else prompt.lower()
    timestamp = datetime.utcnow().strftime("%H:%M")
    page_context = request.context.page if request.context else "dashboard"
    currency_symbol = "€" if request.currency == "EUR" else "$" if request.currency == "USD" else "R$" if request.currency == "BRL" else "£"

    # Intent 1: Spending query by category/software/marketing
    if any(k in lower for k in ["marketing", "software", "gastei", "despesas"]):
        if "software" in lower:
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"Analisando o período em **Software & Cloud**:\n\n"
                     f"• Total gasto: **{currency_symbol}4.850,00**\n"
                     f"• Microsoft 365: {currency_symbol}200,00\n"
                     f"• AWS Cloud Hosting: {currency_symbol}1.450,00\n"
                     f"• Adobe Creative: {currency_symbol}61,49",
                type="analysis",
                timestamp=timestamp,
                actions=[
                    AIChatAction(label="Ver movimentos", action="open_transactions", payload={"category": "Software"}),
                    AIChatAction(label="Criar relatório", action="create_report", payload={"module": "Software"})
                ]
            )
        else:
            return AIChatResponse(
                id=f"msg-{int(datetime.utcnow().timestamp())}",
                sender="ai",
                text=f"Analisando o histórico em **Marketing** (Contexto: {page_context}):\n\n"
                     f"• Total gasto: **{currency_symbol}8.420,00**\n"
                     f"• Google Ads: {currency_symbol}3.200,00\n"
                     f"• Meta Ads: {currency_symbol}1.800,00\n"
                     f"• Agência Digital: {currency_symbol}2.500,00",
                type="analysis",
                timestamp=timestamp,
                actions=[
                    AIChatAction(label="Ver movimentos", action="open_transactions", payload={"category": "Marketing"}),
                    AIChatAction(label="Análise comparativa", action="compare_marketing")
                ]
            )

    # Intent 2: Create category for AI expenses
    if any(k in lower for k in ["categoria", "inteligencia artificial", "ia"]):
        return AIChatResponse(
            id=f"msg-{int(datetime.utcnow().timestamp())}",
            sender="ai",
            text="Encontrei 14 movimentos relacionados com Ferramentas de IA.\n\n"
                 "**Sugestão de Nova Categoria:**\n"
                 "• Nome: 🤖 **Inteligência Artificial**\n"
                 "• Palavras-chave: `openai`, `chatgpt`, `anthropic`, `claude`, `api`\n"
                 f"• Estimativa Anual: **{currency_symbol}4.800,00**",
            type="action",
            timestamp=timestamp,
            actions=[
                AIChatAction(label="Aprovar criação", action="create_category", payload={"name": "Inteligência Artificial"}),
                AIChatAction(label="Editar", action="edit_category")
            ]
        )

    # Intent 3: Pay invoice (Microsoft / EDP)
    if any(k in lower for k in ["paga", "pagar", "fatura microsoft", "microsoft"]):
        return AIChatResponse(
            id=f"msg-{int(datetime.utcnow().timestamp())}",
            sender="ai",
            text="Encontrei a fatura pendente:\n\n"
                 "• **Fornecedor**: Microsoft Ireland Operations\n"
                 f"• **Valor**: **{currency_symbol}4.500,00**\n"
                 "• **Vencimento**: 05/09/2026",
            type="action",
            timestamp=timestamp,
            actionCard={
                "type": "create_transaction",
                "title": "Confirmar Pagamento de Fatura",
                "status": "pending",
                "data": {
                    "supplier": "Microsoft Ireland Operations",
                    "description": "Pagamento Fatura Mensal Microsoft",
                    "category": "Software > Licenças & SaaS",
                    "amount": 4500.00,
                    "due_date": "2026-09-05",
                    "currencySymbol": currency_symbol
                }
            },
            actions=[
                AIChatAction(label="Confirmar pagamento", action="confirm_payment", payload={"supplier": "Microsoft", "amount": 4500.0}),
                AIChatAction(label="Cancelar", action="cancel_action")
            ]
        )

    # Default Intent
    return AIChatResponse(
        id=f"msg-{int(datetime.utcnow().timestamp())}",
        sender="ai",
        text=f"Processado pelo **AI Intent Engine** para '{prompt}'. Contexto de navegação: {page_context}.",
        type="analysis",
        timestamp=timestamp,
        actions=[
            AIChatAction(label="Analisar fluxo", action="analyze_cashflow"),
            AIChatAction(label="Alertas", action="show_alerts")
        ]
    )
