"""Standard chart of accounts for a Portuguese SME.

Structured along the SNC (Sistema de Normalização Contabilística): class 7 for
rendimentos and class 6 for gastos. The SNC reference on each category is what
lets an accountant recognise the plan at a glance and makes the SAF-T mapping
straightforward.

Keywords are what the invoice classifier matches against, so a company can have
documents categorised automatically from day one instead of only after someone
has typed the keywords in by hand.

This file is data. Adding another plan means adding a sibling module and
registering it — no logic changes anywhere.
"""

from app.catalog.types import CategorySpec, ChartTemplate, GroupSpec

# ─────────────────────────── Rendimentos (classe 7) ───────────────────────────

RECEITA = GroupSpec(
    key="receita",
    name="Receita",
    kind="income",
    icon="💰",
    color="emerald",
    description="Tudo o que entra: vendas, serviços e outros rendimentos.",
    is_system=True,
    categories=(
        CategorySpec(
            key="vendas", name="Vendas", snc="71",
            description="Venda de mercadorias e produtos.",
            keywords=("venda", "fatura de venda", "encomenda"),
            children=(
                CategorySpec(key="vendas_mercadorias", name="Mercadorias", snc="711",
                             keywords=("mercadoria", "revenda")),
                CategorySpec(key="vendas_produtos", name="Produtos", snc="712",
                             keywords=("produto", "fabrico")),
            ),
        ),
        CategorySpec(
            key="servicos", name="Prestação de Serviços", snc="72",
            description="Serviços prestados a clientes.",
            keywords=("serviço", "prestação", "honorários"),
            children=(
                CategorySpec(key="servicos_consultoria", name="Consultoria", snc="721",
                             keywords=("consultoria", "projeto", "assessoria")),
                CategorySpec(key="servicos_avencas", name="Avenças", snc="722",
                             keywords=("avença", "mensalidade", "subscrição", "manutenção")),
            ),
        ),
        CategorySpec(
            key="subsidios", name="Subsídios e Apoios", snc="75",
            description="Subsídios à exploração e apoios públicos.",
            keywords=("subsídio", "apoio", "iapmei", "candidatura", "incentivo"),
        ),
        CategorySpec(
            key="juros_obtidos", name="Juros Obtidos", snc="79",
            description="Rendimentos financeiros.",
            keywords=("juros", "aplicação", "depósito a prazo"),
        ),
        CategorySpec(
            key="outros_rendimentos", name="Outros Rendimentos", snc="78",
            description="Rendimentos não enquadrados nas restantes categorias.",
            keywords=("diverso", "outro rendimento"),
        ),
    ),
)

# ───────────────────────────── Gastos (classe 6) ─────────────────────────────

DESPESA = GroupSpec(
    key="despesa",
    name="Despesa",
    kind="expense",
    icon="💸",
    color="rose",
    description="Tudo o que sai: fornecedores, operação e custos.",
    is_system=True,
    categories=(
        CategorySpec(
            key="cmvmc", name="Custo das Mercadorias (CMVMC)", snc="61",
            description="Compras de mercadorias e matérias consumidas.",
            keywords=("compra", "mercadoria", "matéria-prima", "stock"),
            children=(
                CategorySpec(key="cmvmc_mercadorias", name="Compras de Mercadorias", snc="611",
                             keywords=("grossista", "distribuidor", "revenda")),
                CategorySpec(key="cmvmc_materias", name="Matérias-Primas", snc="612",
                             keywords=("matéria-prima", "consumível", "embalagem")),
            ),
        ),
        CategorySpec(
            key="fse", name="Fornecimentos e Serviços Externos", snc="62",
            description="A maior parte das despesas correntes de uma PME.",
            keywords=("serviço externo", "fornecedor"),
            children=(
                CategorySpec(key="fse_energia", name="Eletricidade e Água", snc="6241",
                             keywords=("edp", "galp energia", "endesa", "iberdrola", "epal",
                                       "águas", "eletricidade", "luz", "água")),
                CategorySpec(key="fse_combustiveis", name="Combustíveis", snc="6242",
                             keywords=("galp", "bp", "repsol", "cepsa", "combustível",
                                       "gasóleo", "gasolina", "portagem", "via verde")),
                CategorySpec(key="fse_rendas", name="Rendas e Alugueres", snc="6261",
                             keywords=("renda", "aluguer", "arrendamento", "leasing", "escritório")),
                CategorySpec(key="fse_comunicacoes", name="Comunicações", snc="6262",
                             keywords=("meo", "nos", "vodafone", "altice", "telecom",
                                       "internet", "telemóvel", "ctt")),
                CategorySpec(key="fse_software", name="Software e Licenças", snc="6263",
                             keywords=("microsoft", "google", "adobe", "slack", "figma",
                                       "aws", "amazon web services", "azure", "openai",
                                       "anthropic", "github", "notion", "saas", "licença",
                                       "subscrição", "cloud")),
                CategorySpec(key="fse_publicidade", name="Publicidade e Marketing", snc="6222",
                             keywords=("google ads", "meta", "facebook", "instagram",
                                       "linkedin", "publicidade", "marketing", "anúncio",
                                       "campanha")),
                CategorySpec(key="fse_deslocacoes", name="Deslocações e Estadas", snc="6251",
                             keywords=("hotel", "alojamento", "tap", "ryanair", "cp",
                                       "comboio", "uber", "bolt", "táxi", "viagem",
                                       "deslocação", "estada")),
                CategorySpec(key="fse_honorarios", name="Honorários", snc="6224",
                             keywords=("contabilista", "contabilidade", "advogado",
                                       "jurídico", "revisor", "consultor", "honorários")),
                CategorySpec(key="fse_seguros", name="Seguros", snc="6263",
                             keywords=("seguro", "fidelidade", "tranquilidade", "allianz",
                                       "ageas", "apólice")),
                CategorySpec(key="fse_conservacao", name="Conservação e Reparação", snc="6226",
                             keywords=("reparação", "manutenção", "assistência", "conserto")),
                CategorySpec(key="fse_material", name="Material de Escritório", snc="6234",
                             keywords=("papelaria", "staples", "worten", "material",
                                       "economato", "toner", "impressão")),
                CategorySpec(key="fse_limpeza", name="Limpeza e Higiene", snc="6235",
                             keywords=("limpeza", "higiene", "detergente")),
            ),
        ),
        CategorySpec(
            key="pessoal", name="Gastos com Pessoal", snc="63",
            description="Remunerações e encargos com colaboradores.",
            keywords=("salário", "vencimento", "ordenado", "pessoal"),
            children=(
                CategorySpec(key="pessoal_remuneracoes", name="Remunerações", snc="632",
                             keywords=("salário", "vencimento", "ordenado", "subsídio de férias",
                                       "subsídio de natal")),
                CategorySpec(key="pessoal_seguranca_social", name="Segurança Social", snc="635",
                             keywords=("segurança social", "tsu", "contribuição")),
                CategorySpec(key="pessoal_formacao", name="Formação", snc="638",
                             keywords=("formação", "curso", "workshop", "certificação")),
            ),
        ),
        CategorySpec(
            key="depreciacoes", name="Depreciações e Amortizações", snc="64",
            description="Desgaste de ativos fixos ao longo da vida útil.",
            keywords=("depreciação", "amortização"),
        ),
        CategorySpec(
            key="impostos", name="Impostos e Taxas", snc="681",
            description="Impostos que são gasto (não inclui o IVA nem o IRC).",
            keywords=("imposto", "taxa", "imi", "iuc", "autoridade tributária", "camara municipal"),
        ),
        CategorySpec(
            key="financiamento", name="Gastos de Financiamento", snc="69",
            description="Juros e encargos bancários.",
            keywords=("juros", "comissão bancária", "banco", "financiamento"),
            children=(
                CategorySpec(key="financiamento_juros", name="Juros Suportados", snc="691",
                             keywords=("juros", "empréstimo", "crédito")),
                CategorySpec(key="financiamento_comissoes", name="Comissões Bancárias", snc="6988",
                             keywords=("comissão", "manutenção de conta", "cgd", "millennium",
                                       "santander", "novo banco", "bpi", "revolut")),
            ),
        ),
        CategorySpec(
            key="outros_gastos", name="Outros Gastos", snc="688",
            description="Gastos não enquadrados nas restantes categorias.",
            keywords=("diverso", "outro gasto"),
        ),
    ),
)

TEMPLATE = ChartTemplate(
    code="pt_snc_pme",
    name="Plano Padrão PME (Portugal)",
    description=(
        "Plano de contas segundo o SNC, com as categorias correntes de uma PME "
        "portuguesa e palavras-chave já preenchidas para a classificação automática."
    ),
    country="PT",
    standard="SNC",
    groups=(RECEITA, DESPESA),
)
