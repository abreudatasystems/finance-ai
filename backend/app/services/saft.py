"""SAF-T (PT) — o ficheiro que o contabilista abre.

O SAF-T é um extracto normalizado dos documentos de um período. A versão que
existia aqui produzia um ficheiro que nenhum leitor conseguia abrir: os nomes
das entidades entravam no XML sem escape, e uma empresa chamada "Ribeiro &
Filhos" — que em Portugal é metade delas — partia o ficheiro no primeiro `&`.
Por isso este módulo constrói a árvore com ``ElementTree`` em vez de colar
texto: o escape deixa de ser uma coisa de que alguém se tem de lembrar.

Havia mais quatro problemas, todos do mesmo tipo — o ficheiro dizia uma coisa
e os dados diziam outra:

* **Os clientes e os fornecedores saíam vazios.** A geração lia as tabelas
  ``suppliers`` e ``customers``, abandonadas quando as duas foram unificadas em
  ``entities``. Ficaram a zero, e ninguém reparou porque o XML continuava a
  sair.
* **Cada fatura apontava para um cliente que não estava no ficheiro.** É a
  consequência do ponto anterior, e é o que faz um validador recusar: uma
  referência tem de resolver dentro do próprio documento.
* **A fatura era achatada numa linha só.** As ``transaction_lines`` eram
  ignoradas, portanto uma fatura com 23% e isenta ao mesmo tempo saía com uma
  taxa única — precisamente o caso que justifica o módulo de linhas existir.
* **O cabeçalho não batia com o corpo.** ``TotalCredit`` somava o bruto
  enquanto cada ``NetTotal`` era líquido, e a diferença era o IVA todo.

O que este ficheiro **não** é: um SAF-T de faturação para entregar à AT. Isso
exige software certificado, com ``Hash``, ``ATCUD`` e número de certificado —
e este produto regista documentos, não os emite. O que sai daqui é o extracto
para análise e para entregar a quem faz a contabilidade, e diz isso de si
próprio no cabeçalho em vez de fingir o contrário.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.models import Company, Entity, Item, Transaction, TransactionLine

NAMESPACE = "urn:OECD:StandardAuditFile-Tax:PT_1.04_01"

#: NIF genérico para "consumidor final", quando a contraparte não tem número.
UNKNOWN_NIF = "999999990"

#: O que este extracto é. ``C`` é contabilidade: os documentos são registados,
#: não emitidos por este software. Declarar ``F`` (faturação) seria afirmar uma
#: certificação que não existe.
ACCOUNTING_BASIS = "C"

CENTS = Decimal("0.01")


def _money(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _text(value) -> str:
    """Texto para o XML. O escape é do ElementTree; aqui só se trata o vazio."""
    return "" if value is None else str(value)


def _sub(parent: ET.Element, tag: str, value=None) -> ET.Element:
    node = ET.SubElement(parent, tag)
    if value is not None:
        node.text = _text(value)
    return node


def _amount(parent: ET.Element, tag: str, value) -> ET.Element:
    return _sub(parent, tag, f"{_money(value):.2f}")


# ─────────────────────────── o período ───────────────────────────

def resolve_period(period: Optional[str], today: Optional[date] = None) -> Tuple[str, str, str]:
    """``AAAA`` ou ``AAAA-MM`` → (início, fim exclusivo, ano fiscal).

    O fim é exclusivo para o intervalo não depender do número de dias do mês —
    um Fevereiro com 28 ou 29 dias trata-se sozinho.
    """
    today = today or date.today()

    if period and len(period) == 7 and period[4] == "-":
        year, month = int(period[:4]), int(period[5:7])
        if not 1 <= month <= 12:
            raise ValueError("Mês inválido: use AAAA-MM.")
        start = date(year, month, 1)
        end = date(year + (month // 12), (month % 12) + 1, 1)
    elif period and len(period) == 4:
        year = int(period)
        start, end = date(year, 1, 1), date(year + 1, 1, 1)
    elif period:
        raise ValueError("Período inválido: use AAAA ou AAAA-MM.")
    else:
        year = today.year
        start, end = date(year, 1, 1), date(year + 1, 1, 1)

    return start.isoformat(), end.isoformat(), str(start.year)


# ─────────────────────────── o cabeçalho ───────────────────────────

def _header(root: ET.Element, company: Optional[Company], start: str, end: str,
            fiscal_year: str, generated_at: datetime) -> None:
    nif = (company.nif if company else None) or UNKNOWN_NIF
    header = _sub(root, "Header")
    _sub(header, "AuditFileVersion", "1.04_01")
    _sub(header, "CompanyID", nif)
    _sub(header, "TaxRegistrationNumber", nif)
    _sub(header, "TaxAccountingBasis", ACCOUNTING_BASIS)
    _sub(header, "CompanyName", company.name if company else "Empresa")
    _sub(header, "FiscalYear", fiscal_year)
    _sub(header, "StartDate", start)
    # O SAF-T declara o último dia incluído; ``end`` é exclusivo, recua um dia.
    last_day = date.fromordinal(date.fromisoformat(end).toordinal() - 1)
    _sub(header, "EndDate", last_day.isoformat())
    _sub(header, "CurrencyCode", "EUR")
    _sub(header, "DateCreated", generated_at.date().isoformat())
    _sub(header, "TaxEntity", "Global")
    _sub(header, "ProductCompanyTaxID", UNKNOWN_NIF)
    # Zero é a resposta honesta: este software não está certificado pela AT.
    _sub(header, "SoftwareCertificateNumber", "0")
    _sub(header, "ProductID", "Finance AI/Finance AI")
    _sub(header, "ProductVersion", "1.0")


# ─────────────────────────── os ficheiros mestre ───────────────────────────

def _account_id(entity: Entity, prefix: str) -> str:
    """A conta corrente da entidade. Sem plano de contas mapeado, é ``Desconhecido``."""
    return entity.sub_account or f"{prefix}.{entity.id}"


def _address(parent: ET.Element, entity: Entity, tag: str) -> None:
    address = _sub(parent, tag)
    _sub(address, "AddressDetail", entity.address or entity.address_name or "Desconhecido")
    _sub(address, "City", entity.city or "Desconhecido")
    _sub(address, "PostalCode", entity.postal_code or "0000-000")
    _sub(address, "Country", (entity.country or "PT")[:2].upper())


def _customers(parent: ET.Element, entities: Iterable[Entity]) -> None:
    """Um elemento ``<Customer>`` por cliente.

    A versão anterior abria um ``<Customer>`` só e despejava lá dentro os
    campos de todos — o que, além de não ser o esquema, tornava impossível
    saber onde acaba um cliente e começa o outro.
    """
    for entity in entities:
        node = _sub(parent, "Customer")
        _sub(node, "CustomerID", entity.id)
        _sub(node, "AccountID", _account_id(entity, "21"))
        _sub(node, "CustomerTaxID", entity.nif or UNKNOWN_NIF)
        _sub(node, "CompanyName", entity.name)
        _address(node, entity, "BillingAddress")
        _sub(node, "SelfBillingIndicator", "1" if entity.auto_invoicing else "0")


def _suppliers(parent: ET.Element, entities: Iterable[Entity]) -> None:
    for entity in entities:
        node = _sub(parent, "Supplier")
        _sub(node, "SupplierID", entity.id)
        _sub(node, "AccountID", _account_id(entity, "22"))
        _sub(node, "SupplierTaxID", entity.nif or UNKNOWN_NIF)
        _sub(node, "CompanyName", entity.name)
        _address(node, entity, "BillingAddress")
        _sub(node, "SelfBillingIndicator", "1" if entity.auto_invoicing else "0")


def _products(parent: ET.Element, items: Iterable[Item]) -> None:
    for item in items:
        node = _sub(parent, "Product")
        _sub(node, "ProductType", "P" if item.kind == "product" else "S")
        _sub(node, "ProductCode", item.code)
        _sub(node, "ProductGroup", item.family or item.service_group or "")
        _sub(node, "ProductDescription", item.description)
        # Sem código de barras, o próprio código serve de número do produto.
        _sub(node, "ProductNumberCode", item.ean or item.code)


def _tax_table(parent: ET.Element, rates: Iterable[float]) -> None:
    """A tabela de taxas — só as que os documentos deste período usaram.

    Emitir a tabela toda incluiria taxas que o ficheiro não referencia; emitir
    só as usadas mantém a regra de que tudo o que é referenciado está lá, e
    nada mais.
    """
    table = _sub(parent, "TaxTable")
    for rate in sorted(set(rates), reverse=True):
        entry = _sub(table, "TaxTableEntry")
        _sub(entry, "TaxType", "IVA")
        _sub(entry, "TaxCountryRegion", "PT")
        _sub(entry, "TaxCode", tax_code(rate))
        _sub(entry, "Description", _rate_label(rate))
        _sub(entry, "TaxPercentage", f"{Decimal(str(rate)):.2f}")


def tax_code(rate: Optional[float]) -> str:
    """A taxa em percentagem → o código que o SAF-T usa."""
    value = float(rate or 0)
    if value <= 0:
        return "ISE"
    if value < 10:
        return "RED"
    if value < 20:
        return "INT"
    return "NOR"


def _rate_label(rate: Optional[float]) -> str:
    return {
        "ISE": "Isenta", "RED": "Taxa reduzida",
        "INT": "Taxa intermédia", "NOR": "Taxa normal",
    }[tax_code(rate)]


# ─────────────────────────── as faturas ───────────────────────────

def _line_rows(db: Session, transactions: List[Transaction]) -> Dict[str, List[TransactionLine]]:
    """As linhas de todos os documentos de uma vez, em vez de uma consulta por fatura."""
    ids = [t.id for t in transactions]
    if not ids:
        return {}
    rows = (
        db.query(TransactionLine)
        .filter(TransactionLine.transaction_id.in_(ids))
        .order_by(TransactionLine.transaction_id, TransactionLine.line_number)
        .all()
    )
    grouped: Dict[str, List[TransactionLine]] = {}
    for row in rows:
        grouped.setdefault(row.transaction_id, []).append(row)
    return grouped


def _invoice(parent: ET.Element, trx: Transaction, lines: List[TransactionLine],
             generated_at: datetime) -> Decimal:
    """Uma fatura, com uma ``<Line>`` por linha real. Devolve o líquido."""
    invoice = _sub(parent, "Invoice")
    _sub(invoice, "InvoiceNo", trx.document_number or trx.id)

    status = _sub(invoice, "DocumentStatus")
    _sub(status, "InvoiceStatus", "A" if trx.payment_status == "cancelled" else "N")
    _sub(status, "InvoiceStatusDate", f"{trx.date}T00:00:00")
    _sub(status, "SourceID", trx.created_by or "sistema")
    _sub(status, "SourceBilling", "P")          # produzido a partir de um registo

    _sub(invoice, "InvoiceDate", trx.date)
    _sub(invoice, "InvoiceType", "FT")
    special = _sub(invoice, "SpecialRegimes")
    _sub(special, "SelfBillingIndicator", "0")
    _sub(special, "CashVATSchemeIndicator", "0")
    _sub(special, "ThirdPartiesBillingIndicator", "0")
    _sub(invoice, "SourceID", trx.created_by or "sistema")
    _sub(invoice, "SystemEntryDate", generated_at.strftime("%Y-%m-%dT%H:%M:%S"))
    _sub(invoice, "CustomerID", trx.entity_id or "CONSUMIDOR_FINAL")

    net_total = Decimal("0.00")
    tax_total = Decimal("0.00")

    if lines:
        rows = [
            (row.description, row.quantity, row.unit_price, row.net_amount,
             row.vat_rate, row.vat_amount, row.vat_exemption_reason, row.item_code)
            for row in lines
        ]
    else:
        # Um documento não detalhado continua a ser uma fatura: vale por uma
        # linha, com o que o cabeçalho diz.
        rows = [(
            trx.description, 1, trx.net_amount or trx.amount, trx.net_amount or trx.amount,
            trx.vat_rate, trx.vat_amount, trx.vat_exemption_reason, None,
        )]

    for number, (desc, qty, price, net, rate, tax, exemption, code) in enumerate(rows, start=1):
        line = _sub(invoice, "Line")
        _sub(line, "LineNumber", str(number))
        _sub(line, "ProductCode", code or "GERAL")
        _sub(line, "ProductDescription", desc)
        _sub(line, "Quantity", f"{Decimal(str(qty or 1)):.3f}")
        _sub(line, "UnitOfMeasure", "UN")
        _sub(line, "UnitPrice", f"{Decimal(str(price or net or 0)):.4f}")
        _sub(line, "TaxPointDate", trx.date)
        _sub(line, "Description", desc)
        _amount(line, "CreditAmount", net)

        tax_node = _sub(line, "Tax")
        _sub(tax_node, "TaxType", "IVA")
        _sub(tax_node, "TaxCountryRegion", "PT")
        _sub(tax_node, "TaxCode", tax_code(rate))
        _sub(tax_node, "TaxPercentage", f"{Decimal(str(rate or 0)):.2f}")

        # Sem IVA, o CIVA exige que se diga porquê — e o SAF-T tem campo para isso.
        if not rate:
            _sub(line, "TaxExemptionReason", exemption or "Isento nos termos do CIVA")

        net_total += _money(net)
        tax_total += _money(tax)

    totals = _sub(invoice, "DocumentTotals")
    _amount(totals, "TaxPayable", tax_total)
    _amount(totals, "NetTotal", net_total)
    _amount(totals, "GrossTotal", net_total + tax_total)
    return net_total


# ─────────────────────────── o ficheiro ───────────────────────────

def build(db: Session, company_id: str, period: Optional[str] = None,
          generated_at: Optional[datetime] = None) -> Tuple[str, str]:
    """Constrói o SAF-T do período. Devolve (xml, nome do ficheiro)."""
    generated_at = generated_at or datetime.now(timezone.utc)
    start, end, fiscal_year = resolve_period(period)

    company = db.query(Company).filter(Company.id == company_id).first()

    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status.notin_(["cancelled", "draft"]),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    lines_by_trx = _line_rows(db, transactions)

    entities = (
        db.query(Entity)
        .filter(Entity.company_id == company_id)
        .order_by(Entity.name)
        .all()
    )
    customers = [e for e in entities if e.is_customer]
    suppliers = [e for e in entities if e.is_supplier]

    # Uma referência tem de resolver dentro do próprio ficheiro. Um documento
    # cujo cliente foi entretanto apagado deixaria um CustomerID pendurado, e
    # é isso que faz um validador recusar o ficheiro inteiro.
    known = {e.id for e in customers}
    orphans = {t.entity_id for t in transactions if t.entity_id and t.entity_id not in known}
    if orphans:
        for entity in entities:
            if entity.id in orphans:
                customers.append(entity)
                known.add(entity.id)

    customers.sort(key=lambda e: e.name or "")

    items = (
        db.query(Item)
        .filter(Item.company_id == company_id)
        .order_by(Item.code)
        .all()
    )

    rates: List[float] = []
    for trx in transactions:
        rows = lines_by_trx.get(trx.id)
        if rows:
            rates.extend(float(r.vat_rate or 0) for r in rows)
        else:
            rates.append(float(trx.vat_rate or 0))

    root = ET.Element("AuditFile", {"xmlns": NAMESPACE})
    _header(root, company, start, end, fiscal_year, generated_at)

    masters = _sub(root, "MasterFiles")
    _customers(masters, customers)
    _suppliers(masters, suppliers)
    _products(masters, items)
    _tax_table(masters, rates or [0.0])

    sources = _sub(root, "SourceDocuments")
    sales = _sub(sources, "SalesInvoices")
    _sub(sales, "NumberOfEntries", str(len(transactions)))

    # Os totais do cabeçalho são a soma do que vai a seguir. Escrevem-se depois
    # de somar, e não a partir de outra consulta: era daí que vinha o bruto no
    # sítio do líquido.
    debit = _sub(sales, "TotalDebit")
    credit = _sub(sales, "TotalCredit")

    total_net = Decimal("0.00")
    for trx in transactions:
        total_net += _invoice(sales, trx, lines_by_trx.get(trx.id, []), generated_at)

    debit.text = "0.00"
    credit.text = f"{total_net:.2f}"

    ET.indent(root, space="  ")
    xml = ET.tostring(root, encoding="unicode", xml_declaration=True)

    nif = (company.nif if company else None) or UNKNOWN_NIF
    label = period or fiscal_year
    return xml, f"SAFT-PT_{nif}_{label}.xml"
