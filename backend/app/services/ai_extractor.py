from app.schemas.schemas import DifyExtractionPayload, DifyExtractionResult

async def extract_document_info(file_name: str, text_content: str = "", company_name: str = "TechStart Lda") -> DifyExtractionResult:
    """
    Simulates / Connects to Dify AI Workflow with PaddleOCR / Qwen Vision output.
    Payload format:
    {
      "texto_documento": "...",
      "empresa": "TechStart Lda",
      "categorias_disponiveis": ["Marketing", "Software", "Salários"],
      "fornecedores_existentes": ["Google Ireland Ltd", "Microsoft"]
    }
    """
    lower_name = file_name.lower()
    
    if "google" in lower_name:
        return DifyExtractionResult(
            fornecedor="Google Ireland Ltd",
            data="2026-08-28",
            valor=500.00,
            iva=115.00,
            categoria="Marketing > Google Ads",
            tipo="expense",
            descricao="Campanha Google Ads Agosto 2026",
            confianca=96
        )
    elif "microsoft" in lower_name:
        return DifyExtractionResult(
            fornecedor="Microsoft Ireland Operations",
            data="2026-08-25",
            valor=200.00,
            iva=46.00,
            categoria="Software > Licenças & SaaS",
            tipo="expense",
            descricao="Licença Mensal Microsoft 365 Business",
            confianca=98
        )
    elif "edp" in lower_name:
        return DifyExtractionResult(
            fornecedor="EDP Comercial SA",
            data="2026-08-23",
            valor=180.00,
            iva=41.40,
            categoria="Instalações > Energia & Água",
            tipo="expense",
            descricao="Eletricidade Escritório Lisboa - Agosto",
            confianca=99
        )
    elif "adobe" in lower_name:
        return DifyExtractionResult(
            fornecedor="Adobe Systems Software Ireland",
            data="2026-08-28",
            valor=61.49,
            iva=11.50,
            categoria="Software > Licenças & SaaS",
            tipo="expense",
            descricao="Subscrição Adobe Creative Cloud",
            confianca=97
        )
    else:
        return DifyExtractionResult(
            fornecedor="Fornecedor Processado IA",
            data="2026-08-28",
            valor=350.00,
            iva=80.50,
            categoria="Marketing > Redes Sociais",
            tipo="expense",
            descricao=f"Fatura {file_name}",
            confianca=92
        )
