def calculate_health_score(company_id: str = "COMP001"):
    return {
        "score": 92,
        "trend": 4,
        "status_label": "Excelente",
        "liquidity_score": 95,
        "profitability_score": 88,
        "cost_control_score": 91,
        "predictability_score": 94,
        "runway_months": 8,
        "operating_margin": 32,
        "current_balance": 45230.00,
        "monthly_result": 13180.00,
        "ai_explanation": [
            "Caixa muito saudável com 8 meses de cobertura (runway).",
            "Margem operacional forte em 32% este mês.",
            "Atenção: Custos com Google Ads subiram 43% acima do orçamentado.",
            "Receita total situou-se ligeiramente abaixo da média dos últimos 6 meses (-15%)."
        ],
        "key_insights": [
            {"type": "danger", "text": "Fatura EDP venceu há 5 dias (€180,00)"},
            {"type": "warning", "text": "Fornecedor Google Ireland aumentou preço (+43%)"},
            {"type": "success", "text": "Margem líquida cresceu +22% em relação ao trimestre anterior"},
            {"type": "info", "text": "Subscrição recorrente Microsoft 365 pendente de conciliação"}
        ]
    }
