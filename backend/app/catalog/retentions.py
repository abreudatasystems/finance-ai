"""Retenção na fonte — the tax a company withholds from what it pays.

The third kind of money that passes through a company without belonging to it.
The product already separated two of them:

* **IVA** — collected from the client, owed to the State;
* **the settlement** — approving a document is not paying it.

This is the third, and it moves in the opposite direction: on an invoice for
professional services, the *payer* keeps part of the amount and delivers it to
the State on the supplier's behalf. So the document says 184,50 € and the bank
transfer is 147,00 €, with 37,50 € owed to the State by the 20th of the next
month. A product that pays the full amount is wrong twice: it overstates the
outflow and it hides a liability with its own deadline.

**The base is the amount without VAT.** Retention is computed on the taxable
base, never on the gross: 150 € + 23% IVA = 184,50 €, retention 25% × 150 € =
37,50 €. Getting this backwards inflates the withholding by the VAT rate.

**It applies in both directions.** A company that invoices another company for
professional services is withheld from: it invoices 1 230 € and receives
980 €, and the 250 € is a credit against its own income tax. Only modelling
the expense side leaves every receivable forecast wrong by the retention.

Rates and the rules that dispense with them are set by law and revised most
years in the Orçamento do Estado. What follows are **defaults**, carried as
data so a company can override them and an accountant can correct them,
never as constants buried in a calculation. Nothing here decides a company's
tax position — that is the accountant's, and the labels say so.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class RetentionType:
    """One kind of withholding a document can carry."""

    #: Stable slug — what a document stores, so a rate change never rewrites history.
    code: str
    label: str
    #: Default percentage on the taxable base. Overridable per company.
    rate: Decimal
    #: irs (people and sole traders) | irc (companies)
    tax: str
    #: The IRS/IRC income category this belongs to.
    category: str
    #: The article the rate comes from, so a figure can be checked.
    basis: str
    #: Which side of the books it can appear on: expense, income, or both.
    applies_to: Tuple[str, ...] = ("expense", "income")
    hint: Optional[str] = None


#: The withholdings a Portuguese SME actually meets. Deliberately short: a
#: list nobody can read is a list nobody picks the right line from.
PT_RETENTIONS: Tuple[RetentionType, ...] = (
    RetentionType(
        code="irs_b_25",
        label="Serviços profissionais — 25%",
        rate=Decimal("25"),
        tax="irs",
        category="B — empresariais e profissionais",
        basis="art. 101.º, n.º 1, al. b) do CIRS",
        hint=(
            "O caso comum: honorários de contabilistas, advogados, consultores, "
            "formadores e outras profissões da tabela do art. 151.º."
        ),
    ),
    RetentionType(
        code="irs_b_235",
        label="Serviços profissionais — 23,5% (taxa reduzida)",
        rate=Decimal("23.5"),
        tax="irs",
        category="B — empresariais e profissionais",
        basis="art. 101.º do CIRS",
        hint="Metade da taxa aplica-se a residentes em regiões com redução própria.",
    ),
    RetentionType(
        code="irs_b_165",
        label="Propriedade intelectual — 16,5%",
        rate=Decimal("16.5"),
        tax="irs",
        category="B — propriedade intelectual",
        basis="art. 101.º, n.º 1, al. a) do CIRS",
        hint="Direitos de autor e propriedade industrial pagos ao próprio titular.",
    ),
    RetentionType(
        code="irs_b_115",
        label="Outras atividades — 11,5%",
        rate=Decimal("11.5"),
        tax="irs",
        category="B — outras prestações",
        basis="art. 101.º, n.º 1, al. c) do CIRS",
        hint=(
            "Atividades não previstas na tabela do art. 151.º — o código 1519, "
            "usado por muitos prestadores."
        ),
    ),
    RetentionType(
        code="irs_f_25",
        label="Rendas prediais — 25%",
        rate=Decimal("25"),
        tax="irs",
        category="F — prediais",
        basis="art. 101.º, n.º 1, al. e) do CIRS",
        applies_to=("expense",),
        hint="A renda paga a um senhorio particular. O senhorio recebe 75%.",
    ),
    RetentionType(
        code="irs_e_28",
        label="Capitais — 28%",
        rate=Decimal("28"),
        tax="irs",
        category="E — capitais",
        basis="art. 71.º do CIRS",
        applies_to=("expense",),
        hint="Juros e dividendos pagos a particulares.",
    ),
    RetentionType(
        code="irc_25",
        label="Pagamentos a sociedades — 25%",
        rate=Decimal("25"),
        tax="irc",
        category="IRC",
        basis="art. 94.º do CIRC",
        hint="Rendas e royalties pagos a pessoas coletivas residentes.",
    ),
    RetentionType(
        code="isento",
        label="Sem retenção",
        rate=Decimal("0"),
        tax="irs",
        category="—",
        basis="art. 101.º-B do CIRS (dispensa) ou operação não sujeita",
        hint=(
            "Dispensa por baixo volume de rendimentos, ou uma operação que "
            "simplesmente não está sujeita. Confirme com o contabilista."
        ),
    ),
)

BY_CODE: Dict[str, RetentionType] = {r.code: r for r in PT_RETENTIONS}

#: What a company gets when it does not choose — the honest default is none,
#: because withholding where none is due is as wrong as the reverse.
DEFAULT_CODE = "isento"


def get(code: Optional[str]) -> Optional[RetentionType]:
    """The type behind a code, or None when the code is unknown or absent."""
    if not code:
        return None
    return BY_CODE.get(code)


def for_side(side: str) -> Tuple[RetentionType, ...]:
    """The types that can appear on expenses, or on income."""
    return tuple(r for r in PT_RETENTIONS if side in r.applies_to)


def serialize(retention: RetentionType) -> dict:
    return {
        "codigo": retention.code,
        "label": retention.label,
        "taxa": float(retention.rate),
        "imposto": retention.tax,
        "categoria": retention.category,
        "base_legal": retention.basis,
        "aplica_a": list(retention.applies_to),
        "nota": retention.hint,
    }
