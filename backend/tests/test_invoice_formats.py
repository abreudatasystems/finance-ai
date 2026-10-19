"""Faturas como chegam de verdade a uma PME portuguesa.

Os PDFs liam-se (o texto saía inteiro) mas a interpretação só conhecia um
formato: "Fatura n.º", "Total:" na mesma linha, data ao lado do título. Uma
fatura da Câmara de Mafra (programa PRIMAVERA) saía com o fornecedor "Pág.
1/1" e sem valor; um comprovativo da Caixadirecta com o valor 0,00 (a
comissão do banco) em vez do montante pago. Cada caso aqui é um formato real.
"""

import io

import pytest

from app.services.invoice_parser import parse_invoice_text

# Texto como o pdfplumber o devolve (com o alinhamento das colunas).
MUNICIPIO = """
                                                                           Pág. 1/1
         Município de Mafra
         Contribuinte N.º: 502177080
         Praça do Município
         Mafra                                      Exmo.(s) Sr.(s)
         2644-001 Mafra                             Cliente Exemplo
         Telef. 261 810 100 Fax. 261 810 130        Rua Exemplo 1
         geral@cm-mafra.pt                          1000-001 Lisboa  
         Fatura FT FATMT.2026A/9999
                                                                           Original
         V/N.º Contrib. Requisição   Moeda         Câmbio        Data
         123456789     TT20269999000001 EUR        1,00          2026-10-12
         Desc. Cli.    Desc. Fin.    Vencimento    Condição Pagamento
         0,00          0,00          2026-10-31
         Artigo       Descrição              Qtd. Un. Pr. Unitário Desc. IVA Valor
         2026TXTMT56.2.1 TAXA MUNICIPAL TURÍSTICA - ÉPOCA ALTA 47,00 UN 2,5000 0,00 (I4) 0,00 117,50
                                                      Mercadoria/Serviços   117,50
         Quadro Resumo de Impostos (IVA Incluído à Taxa) Descontos Comerciais 0,00
         Taxa/Valor    Incid./Qtd. Total Motivo Isenção Desconto Financeiro  0,00
         IVA (0,00) (I4) 117,50 0,00  Não sujeito ou não tributado Portes    0,00
         IVA                    0,00
         Total ( EUR )       117,50
         Montante        117,50
         Data Limite   2026-10-31
         Este documento serve de recibo após boa cobrança.
"""

COMPROVATIVO_CGD = """
            ID: 900000001,
            Data de emissão: 19-10-2026 12:53,
            Página 1/1
                                         Comprovativo de Operação Caixadirecta Empresas
            Na sequência do pedido efectuado por EMPRESA TESTE LDA contribuinte nº 500000000, o
            serviço Caixadirecta Empresas registou a operação abaixo referida.
                          Tipo Pagamento de serviços e compras
                        Entidade 21449 CAMARA MUNICIPAL DE LISBOA
                       Referencia 900000002
                       Montante 384,00 EUR
                    Data de criação 15-10-2026 18:13:54
             Custo total
                       Custo total 0,00 EUR
"""

MULTITAXA = """
SUPERMERCADOS EXEMPLO, S.A.
NIF: 503504564
Rua do Comércio, 10 - Lisboa
FATURA FT A2026/1187
Data de emissão: 03/09/2026
Vencimento: 03/10/2026
Taxa     Incidência     IVA
6%         20,00        1,20
23%        40,00        9,20
Base tributável: 60,00
Total IVA: 10,40
Total a pagar: 70,40 €
"""

INGLES = """
Google Ireland Limited
Gordon House, Barrow Street, Dublin 4
VAT Number: IE6388047V
Invoice number: 5212345678
Invoice date: 2026-09-30
Subtotal in EUR    100.00
VAT (23%)          23.00
Total in EUR      €123.00
"""

LUZ = """
EDP Comercial - Comercialização de Energia, S.A.
NIPC 503504564
Fatura N.º 10273645823
Data de emissão 12.09.2026
Data limite de pagamento 30.09.2026
Valor sem IVA 81,30 €
IVA 6% 2,10 €  IVA 23% 13,85 €
Valor a pagar 97,25 €
"""

FATURA_RECIBO = """
Contabilidade Rigorosa, Lda
Contribuinte: 509 876 541
Fatura-Recibo FR 2026/77
Data: 2026-09-15
Avença mensal de contabilidade      1.000,00
IVA 23%                               230,00
Total:                              1.230,00 €
"""


@pytest.mark.parametrize("text, own, expected", [
    (MUNICIPIO, None, {
        "supplier": "Município de Mafra", "nif": "502177080",
        "document_number": "FT FATMT.2026A/9999", "document_type": "invoice",
        "document_date": "2026-10-12", "due_date": "2026-10-31",
        "gross_amount": "117.50", "vat_amount": "0.00",
    }),
    (COMPROVATIVO_CGD, "500000000", {
        "supplier": "CAMARA MUNICIPAL DE LISBOA", "document_type": "receipt",
        "document_date": "2026-10-15", "gross_amount": "384.00",
    }),
    (MULTITAXA, None, {
        "supplier": "SUPERMERCADOS EXEMPLO, S.A.", "nif": "503504564",
        "document_number": "FT A2026/1187", "document_date": "2026-09-03",
        "due_date": "2026-10-03", "net_amount": "60.00", "vat_amount": "10.40",
        "gross_amount": "70.40",
    }),
    (INGLES, None, {
        "supplier": "Google Ireland Limited", "nif": "IE6388047V",
        "document_date": "2026-09-30", "net_amount": "100.00", "vat_amount": "23.00",
        "gross_amount": "123.00",
    }),
    (LUZ, None, {
        "nif": "503504564", "document_number": "10273645823",
        "document_date": "2026-09-12", "due_date": "2026-09-30", "gross_amount": "97.25",
    }),
    (FATURA_RECIBO, None, {
        "supplier": "Contabilidade Rigorosa, Lda", "nif": "509876541",
        "document_number": "FR 2026/77", "document_type": "invoice_receipt",
        "document_date": "2026-09-15", "vat_amount": "230.00", "gross_amount": "1230.00",
    }),
], ids=["camara-mafra", "comprovativo-cgd", "multitaxa", "ingles", "luz", "fatura-recibo"])
def test_real_world_formats(text, own, expected):
    parsed = parse_invoice_text(text, own_nif=own)
    got = {k: (str(getattr(parsed, k)) if getattr(parsed, k) is not None else None) for k in expected}
    assert got == expected


def test_the_company_itself_is_never_the_supplier():
    """Num comprovativo o primeiro NIF é o de quem paga — a própria empresa."""
    parsed = parse_invoice_text(COMPROVATIVO_CGD, own_nif="500000000")
    assert parsed.nif != "500000000"


def test_a_text_pdf_goes_through_the_whole_pipeline():
    """Um PDF com camada de texto, gerado como os programas de faturação o fazem."""
    import asyncio
    from fpdf import FPDF
    from app.services.open_source_ocr import process_document

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for line in MULTITAXA.strip().splitlines():
        pdf.cell(0, 6, line.replace("€", "EUR"), new_x="LMARGIN", new_y="NEXT")
    data = bytes(pdf.output())

    parsed, text = asyncio.run(process_document(data, "fatura.pdf"))
    assert "SUPERMERCADOS" in text
    assert str(parsed.gross_amount) == "70.40"
    assert parsed.nif == "503504564"
    assert parsed.validation_status == "valid"


# ---------------------------------------------------------------------------
# Enviar outra vez o mesmo ficheiro
# ---------------------------------------------------------------------------

def _pdf(lines) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for line in lines:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def _upload(tenant, data: bytes, name: str = "fatura.pdf"):
    return tenant.client.post(
        "/api/v1/documents/upload", headers=tenant.headers,
        files={"file": (name, data, "application/pdf")},
    )


def test_sending_an_unapproved_file_again_reads_it_again(tenant):
    """Antes recusava como "duplicado" e a leitura má ficava para sempre."""
    data = _pdf(MULTITAXA.replace("€", "EUR").strip().splitlines())
    first = _upload(tenant, data)
    assert first.status_code == 201, first.text

    second = _upload(tenant, data)
    assert second.status_code == 201, second.text
    assert second.json()["reread"] is True

    documents = tenant.get("/api/v1/documents/").json()
    names = [d["file_name"] for d in (documents if isinstance(documents, list) else documents.get("items", []))]
    assert names.count("fatura.pdf") == 1, "a leitura antiga sai, fica só a nova"
    pending = tenant.get("/api/v1/approvals/").json()
    assert len([a for a in pending if a["document_name"] == "fatura.pdf"]) == 1


def test_an_approved_file_is_not_booked_twice(tenant):
    data = _pdf(MULTITAXA.replace("€", "EUR").strip().splitlines())
    first = _upload(tenant, data).json()
    approved = tenant.post(f"/api/v1/approvals/{first['approval_id']}/action?action=approved")
    assert approved.status_code == 200, approved.text

    again = _upload(tenant, data)
    assert again.status_code == 409
    assert "aprovado" in again.json()["detail"]


def test_the_category_comes_from_what_was_billed_not_from_the_boilerplate():
    """"Vencimento" é a data (não salários) e "Mercadoria/Serviços" está em
    todas as faturas (não é "Mercadorias")."""
    from types import SimpleNamespace
    from app.services.open_source_ocr import suggest_category

    cats = [
        SimpleNamespace(id="PESSOAL", name="Gastos com Pessoal", keywords="vencimento,salário"),
        SimpleNamespace(id="MERC", name="Mercadorias", keywords="mercadoria"),
        SimpleNamespace(id="IMP", name="Impostos e Taxas", keywords="imposto,taxa"),
    ]
    parsed = parse_invoice_text(MUNICIPIO)
    assert suggest_category(parsed, cats, MUNICIPIO)[0] == "IMP"
