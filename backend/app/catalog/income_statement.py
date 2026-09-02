"""How SNC accounts become the lines of a Demonstração de Resultados.

Declarative on purpose: the shape of the statement is data, so adding a
country or a different presentation means another table here, not another
branch inside the calculation.

The order is the Portuguese "por naturezas" statement, and the subtotals are
the ones a bank, an accountant or a buyer will look for: EBITDA, resultado
operacional, resultado antes de impostos, resultado líquido.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class Line:
    """One row of the statement."""

    key: str
    label: str
    #: income | expense — which side of the books feeds it.
    nature: str
    #: SNC account prefixes, longest first so 681 wins over 68.
    accounts: Tuple[str, ...]
    #: Which subtotal this line belongs to.
    section: str
    hint: Optional[str] = None


@dataclass(frozen=True)
class Subtotal:
    """A computed line: what it adds and what it takes away."""

    key: str
    label: str
    adds: Tuple[str, ...]
    subtracts: Tuple[str, ...] = ()
    emphasis: bool = False
    hint: Optional[str] = None


#: Operating revenue.
LINES: Tuple[Line, ...] = (
    Line("vendas", "Vendas e serviços prestados", "income", ("71", "72"), "rendimentos",
         "O que a empresa facturou pela sua actividade, sem IVA."),
    Line("subsidios", "Subsídios à exploração", "income", ("75",), "rendimentos"),
    Line("outros_rendimentos", "Outros rendimentos", "income", ("78",), "rendimentos"),

    Line("cmvmc", "Custo das mercadorias vendidas e matérias consumidas", "expense",
         ("61",), "gastos_operacionais"),
    Line("fse", "Fornecimentos e serviços externos", "expense", ("62",), "gastos_operacionais",
         "Rendas, electricidade, comunicações, honorários, software."),
    Line("pessoal", "Gastos com pessoal", "expense", ("63",), "gastos_operacionais"),
    Line("impostos", "Impostos e taxas", "expense", ("681",), "gastos_operacionais",
         "Impostos que não o IRC. No SNC ficam dentro de Outros gastos (68)."),
    Line("outros_gastos", "Outros gastos", "expense", ("688", "68"), "gastos_operacionais"),

    Line("depreciacoes", "Gastos de depreciação e amortização", "expense", ("64",), "depreciacoes"),

    Line("juros_obtidos", "Juros e rendimentos similares obtidos", "income", ("79",), "financeiro"),
    Line("financiamento", "Juros e gastos similares suportados", "expense", ("69",), "financeiro"),
)

#: Anything whose category carries no SNC account. It is shown rather than
#: dropped: a statement that silently loses movements is worse than one that
#: admits it has unclassified amounts.
UNMAPPED = Line(
    "nao_classificado", "Sem conta SNC atribuída", "expense", (), "gastos_operacionais",
    "Lançamentos cuja categoria não tem conta SNC — classifique-os para saírem daqui.",
)

SUBTOTALS: Tuple[Subtotal, ...] = (
    Subtotal("total_rendimentos", "Total de rendimentos operacionais",
             ("vendas", "subsidios", "outros_rendimentos")),
    Subtotal("total_gastos", "Total de gastos operacionais",
             ("cmvmc", "fse", "pessoal", "impostos", "outros_gastos", "nao_classificado")),
    Subtotal("ebitda", "EBITDA", ("total_rendimentos",), ("total_gastos",), emphasis=True,
             hint="Resultado antes de depreciações, juros e impostos."),
    Subtotal("ebit", "Resultado operacional (EBIT)", ("ebitda",), ("depreciacoes",), emphasis=True),
    Subtotal("rai", "Resultado antes de impostos", ("ebit", "juros_obtidos"), ("financiamento",),
             emphasis=True),
    Subtotal("resultado_liquido", "Resultado líquido do período", ("rai",), (), emphasis=True,
             hint="O IRC não é apurado aqui — depende de correcções fiscais que este "
                  "sistema não faz. Este valor é o resultado antes desse imposto."),
)


def line_for(snc_code: Optional[str], nature: str) -> Line:
    """Which statement line an account belongs to.

    Longest prefix wins, so 681 lands on Impostos rather than Outros gastos.
    An account we do not recognise falls to the unmapped line instead of being
    quietly discarded.
    """
    code = (snc_code or "").strip()
    if code:
        best: Optional[Line] = None
        best_length = 0
        for line in LINES:
            for prefix in line.accounts:
                if code.startswith(prefix) and len(prefix) > best_length:
                    best, best_length = line, len(prefix)
        if best:
            return best
    return UNMAPPED
