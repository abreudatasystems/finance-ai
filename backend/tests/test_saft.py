"""O SAF-T (PT) tem de bater certo consigo próprio.

Um ficheiro de auditoria não vale pelo que parece — vale por ser lido por uma
máquina que não perdoa. Estes testes fixam as cinco coisas que o ficheiro
anterior fazia mal, todas do mesmo tipo: dizia uma coisa e os dados diziam
outra, e ninguém dava por isso porque o download continuava a funcionar.
"""

import xml.etree.ElementTree as ET
from decimal import Decimal

NS = {"n": "urn:OECD:StandardAuditFile-Tax:PT_1.04_01"}


def _saft(tenant, period: str = "2026") -> ET.Element:
    response = tenant.get(f"/api/v1/fiscal/saft-export?period={period}")
    assert response.status_code == 200, response.text
    return ET.fromstring(response.text)      # levanta ParseError se for mal-formado


def _customer(tenant, name: str, nif: str = "509442012") -> dict:
    response = tenant.post("/api/v1/entities/", {
        "name": name, "nif": nif, "is_customer": True,
    })
    assert response.status_code == 201, response.text
    return response.json()


def _sale(tenant, customer: dict, amount: float = 123.00, date: str = "2026-05-14") -> dict:
    category = tenant.category("income")
    return tenant.book(
        "income", amount, date=date, category=category,
        entity_name=customer["name"], entity_id=customer["id"],
        document_number="FT 2026/1",
    )


def _text(node, path: str):
    found = node.find(path, NS)
    return found.text if found is not None else None


# ---------------------------------------------------------------------------
# O ficheiro tem de abrir
# ---------------------------------------------------------------------------

def test_an_ampersand_in_a_name_does_not_break_the_file(tenant):
    """"Ribeiro & Filhos" é metade das empresas portuguesas.

    A geração colava texto em vez de construir XML, por isso o primeiro `&`
    de um nome tornava o ficheiro impossível de abrir em qualquer leitor.
    """
    customer = _customer(tenant, "Padaria Ribeiro & Filhos <Lda>")
    _sale(tenant, customer)

    root = _saft(tenant)                      # já falharia aqui se voltasse a partir

    names = [n.text for n in root.findall(".//n:Customer/n:CompanyName", NS)]
    assert "Padaria Ribeiro & Filhos <Lda>" in names


# ---------------------------------------------------------------------------
# As contrapartes existem — e as faturas apontam para elas
# ---------------------------------------------------------------------------

def test_the_counterparties_come_from_the_entity_register(tenant):
    """Liam-se as tabelas ``suppliers``/``customers``, vazias desde a unificação."""
    _customer(tenant, "Cliente Real, Lda")
    supplier = tenant.post("/api/v1/entities/", {
        "name": "Fornecedor Real, Lda", "nif": "501442013", "is_supplier": True,
    }).json()
    assert supplier["id"]

    root = _saft(tenant)

    assert [n.text for n in root.findall(".//n:Customer/n:CompanyName", NS)] == ["Cliente Real, Lda"]
    assert [n.text for n in root.findall(".//n:Supplier/n:CompanyName", NS)] == ["Fornecedor Real, Lda"]


def test_every_invoice_points_at_a_customer_that_is_in_the_file(tenant):
    """Uma referência que não resolve faz um validador recusar o ficheiro todo."""
    for index in range(3):
        customer = _customer(tenant, f"Cliente {index}", nif=f"50944201{index}")
        _sale(tenant, customer)

    root = _saft(tenant)

    known = {n.text for n in root.findall(".//n:Customer/n:CustomerID", NS)}
    referenced = {n.text for n in root.findall(".//n:Invoice/n:CustomerID", NS)}
    assert referenced and referenced <= known


def test_each_customer_is_its_own_element(tenant):
    """Abria-se um ``<Customer>`` só, com os campos de todos lá dentro."""
    _customer(tenant, "Cliente A", nif="509442010")
    _customer(tenant, "Cliente B", nif="509442011")

    root = _saft(tenant)
    customers = root.findall(".//n:MasterFiles/n:Customer", NS)

    assert len(customers) == 2
    for node in customers:
        assert len(node.findall("n:CustomerID", NS)) == 1
        assert _text(node, "n:CustomerTaxID")
        assert node.find("n:BillingAddress", NS) is not None


# ---------------------------------------------------------------------------
# Uma fatura com várias taxas continua a ter várias taxas
# ---------------------------------------------------------------------------

def test_a_mixed_rate_invoice_keeps_one_line_per_rate(tenant):
    """A fatura era achatada numa linha só, com a taxa do cabeçalho."""
    customer = _customer(tenant, "Cliente Misto, Lda")
    sale = _sale(tenant, customer)
    tenant.put(f"/api/v1/transactions/{sale['id']}/lines", {"lines": [
        {"description": "Consultoria", "net_amount": 100.00, "vat_rate": 23},
        {"description": "Formação", "net_amount": 50.00, "vat_rate": 0,
         "vat_exemption_reason": "art.º 9.º do CIVA"},
    ]})

    root = _saft(tenant)
    invoice = root.find(".//n:Invoice", NS)
    lines = invoice.findall("n:Line", NS)

    assert len(lines) == 2
    assert {_text(l, "n:Tax/n:TaxPercentage") for l in lines} == {"23.00", "0.00"}
    assert {_text(l, "n:Tax/n:TaxCode") for l in lines} == {"NOR", "ISE"}
    # Sem IVA, o CIVA obriga a dizer porquê.
    exempt = next(l for l in lines if _text(l, "n:Tax/n:TaxCode") == "ISE")
    assert _text(exempt, "n:TaxExemptionReason") == "art.º 9.º do CIVA"


def test_a_document_without_lines_is_still_one_line(tenant):
    """Nem todo o documento é detalhado, e continua a ser uma fatura."""
    customer = _customer(tenant, "Cliente Simples, Lda")
    _sale(tenant, customer, amount=123.00)

    invoice = _saft(tenant).find(".//n:Invoice", NS)
    lines = invoice.findall("n:Line", NS)

    assert len(lines) == 1
    assert _text(lines[0], "n:LineNumber") == "1"


def test_the_tax_table_declares_the_rates_the_lines_use(tenant):
    customer = _customer(tenant, "Cliente Taxas, Lda")
    sale = _sale(tenant, customer)
    tenant.put(f"/api/v1/transactions/{sale['id']}/lines", {"lines": [
        {"description": "A", "net_amount": 10.00, "vat_rate": 23},
        {"description": "B", "net_amount": 10.00, "vat_rate": 6},
    ]})

    root = _saft(tenant)
    codes = {n.text for n in root.findall(".//n:TaxTable/n:TaxTableEntry/n:TaxCode", NS)}
    used = {n.text for n in root.findall(".//n:Line/n:Tax/n:TaxCode", NS)}

    assert used <= codes


# ---------------------------------------------------------------------------
# O cabeçalho é a soma do corpo
# ---------------------------------------------------------------------------

def test_the_declared_total_is_the_sum_of_the_invoices(tenant):
    """``TotalCredit`` somava o bruto enquanto cada ``NetTotal`` era líquido."""
    customer = _customer(tenant, "Cliente Totais, Lda")
    for index in range(3):
        _sale(tenant, customer, amount=123.00, date=f"2026-0{index + 1}-10")

    root = _saft(tenant)
    declared = Decimal(_text(root, ".//n:SalesInvoices/n:TotalCredit"))
    summed = sum(
        Decimal(n.text) for n in root.findall(".//n:Invoice/n:DocumentTotals/n:NetTotal", NS)
    )

    assert declared == summed
    assert declared == Decimal("300.00")      # 123,00 com IVA a 23% é 100,00 de base


def test_the_number_of_entries_matches_the_invoices(tenant):
    customer = _customer(tenant, "Cliente Contagem, Lda")
    for index in range(4):
        _sale(tenant, customer, date=f"2026-0{index + 1}-05")

    root = _saft(tenant)
    declared = int(_text(root, ".//n:SalesInvoices/n:NumberOfEntries"))

    assert declared == len(root.findall(".//n:Invoice", NS)) == 4


# ---------------------------------------------------------------------------
# O período, e o que fica de fora
# ---------------------------------------------------------------------------

def test_a_month_only_carries_that_month(tenant):
    customer = _customer(tenant, "Cliente Mês, Lda")
    _sale(tenant, customer, date="2026-05-14")
    _sale(tenant, customer, date="2026-06-14")

    root = _saft(tenant, period="2026-05")

    assert len(root.findall(".//n:Invoice", NS)) == 1
    assert _text(root, ".//n:Header/n:StartDate") == "2026-05-01"
    # O SAF-T declara o último dia incluído, não o dia a seguir.
    assert _text(root, ".//n:Header/n:EndDate") == "2026-05-31"


def test_a_nonsense_period_is_refused(tenant):
    response = tenant.get("/api/v1/fiscal/saft-export?period=amanha")
    assert response.status_code == 400

    response = tenant.get("/api/v1/fiscal/saft-export?period=2026-13")
    assert response.status_code == 400


def test_only_sales_are_in_the_sales_invoices(tenant):
    """Uma despesa não é uma fatura emitida."""
    customer = _customer(tenant, "Cliente Vendas, Lda")
    _sale(tenant, customer)
    tenant.book("expense", 500.00, date="2026-05-20")

    root = _saft(tenant)
    assert len(root.findall(".//n:Invoice", NS)) == 1


def test_another_company_is_not_in_this_file(tenant, other_tenant):
    theirs = _customer(other_tenant, "Cliente Alheio, Lda", nif="509442099")
    _sale(other_tenant, theirs)

    root = _saft(tenant)

    assert root.findall(".//n:Invoice", NS) == []
    assert "Cliente Alheio, Lda" not in [
        n.text for n in root.findall(".//n:Customer/n:CompanyName", NS)
    ]


# ---------------------------------------------------------------------------
# O ficheiro diz o que é
# ---------------------------------------------------------------------------

def test_the_header_does_not_claim_a_certification_it_does_not_have(tenant):
    """Declarar faturação certificada seria afirmar o que não existe."""
    root = _saft(tenant)

    assert _text(root, ".//n:Header/n:SoftwareCertificateNumber") == "0"
    # ``C`` de contabilidade: os documentos são registados, não emitidos.
    assert _text(root, ".//n:Header/n:TaxAccountingBasis") == "C"
