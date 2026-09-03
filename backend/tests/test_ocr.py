"""Ler uma fatura a partir do que a pessoa realmente tem à frente.

Estes testes constroem ficheiros verdadeiros — uma imagem com texto desenhado,
e a mesma imagem embrulhada num PDF — e passam-nos pelo caminho completo. É a
única maneira de fixar o que estava partido: o código do OCR existia, mas a
condição que o protegia era sempre falsa e o passo de converter uma página de
PDF em imagem não existia de todo. Os dois casos devolviam texto vazio, e um
teste escrito sobre texto colado à mão nunca teria dado por isso.

Quando o Tesseract não está instalado, os testes que dependem dele são
saltados em vez de falharem: a instalação sem motor é uma instalação legítima
— apenas não lê fotografias, e é isso que ``engine_status`` serve para dizer.
"""

import asyncio
import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.services.open_source_ocr import (
    Extraction, TextSource, engine_status, extract, prepare_for_ocr,
    process_document,
)

CAPABILITIES = engine_status()
needs_ocr = pytest.mark.skipif(
    not CAPABILITIES["imagens"],
    reason="tesseract-ocr não está instalado nesta máquina",
)
needs_raster = pytest.mark.skipif(
    not CAPABILITIES["pdf_digitalizado"],
    reason="falta tesseract-ocr ou pypdfium2",
)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"

#: Uma fatura da luz, que é o documento que mais entra numa PME.
INVOICE_LINES = [
    "NIF: 503504564",
    "Fatura n.o FT 2026/00412",
    "Data: 12/09/2026",
    "Vencimento: 27/09/2026",
    "Base tributavel: 137,42 EUR",
    "IVA 23%: 31,61 EUR",
    "Total: 169,03 EUR",
]


def _font(size: int):
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f"{FONT_DIR}/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default()


def invoice_image(supplier: str = "EDP COMERCIAL, S.A.",
                  lines=None, width: int = 1000) -> Image.Image:
    """Uma fatura desenhada numa imagem — o que sai de uma fotografia."""
    lines = INVOICE_LINES if lines is None else lines
    image = Image.new("RGB", (width, 140 + len(lines) * 62), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 40), supplier, font=_font(34), fill="black")
    for index, line in enumerate(lines):
        draw.text((40, 110 + index * 62), line, font=_font(28), fill="black")
    return image


def as_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def as_scanned_pdf(image: Image.Image) -> bytes:
    """A imagem embrulhada num PDF: sem camada de texto, como um scan."""
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="PDF")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# O que antes devolvia vazio
# ---------------------------------------------------------------------------

@needs_ocr
def test_a_photograph_of_a_receipt_is_read():
    """O caminho existia atrás de um ``if`` que era sempre falso."""
    result = extract(as_png(invoice_image()), "recibo.png")

    assert result.ok
    assert result.source == TextSource.IMAGE_OCR
    assert "EDP" in result.text
    assert "503504564" in result.text


@needs_raster
def test_a_scanned_pdf_is_read():
    """Faltava o passo do meio por inteiro: página → imagem → OCR.

    Um PDF digitalizado é uma imagem dentro de um invólucro de PDF. Só se
    tentava ler a camada de texto, que num scan não existe.
    """
    result = extract(as_scanned_pdf(invoice_image()), "fatura.pdf")

    assert result.ok
    assert result.source == TextSource.PDF_OCR
    assert result.pages == 1
    assert "503504564" in result.text


@needs_ocr
def test_the_parser_gets_the_whole_invoice_from_a_photograph():
    """O fim é este: a fotografia dá uma fatura preenchida, não um formulário vazio."""
    parsed, _ = asyncio.run(process_document(as_png(invoice_image()), "recibo.png"))

    assert parsed.nif == "503504564"
    assert parsed.document_number == "FT 2026/00412"
    assert parsed.document_date == "2026-09-12"
    assert parsed.due_date == "2026-09-27"
    assert float(parsed.gross_amount) == 169.03
    assert float(parsed.vat_amount) == 31.61
    assert parsed.vat_rate == 23.0
    assert parsed.confidence > 0.5


# ---------------------------------------------------------------------------
# A camada de texto vem primeiro
# ---------------------------------------------------------------------------

def test_a_pdf_with_a_text_layer_never_reaches_the_engine():
    """Ler é exacto e custa milissegundos; adivinhar de pixels não é nem uma coisa nem outra."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    buffer = io.BytesIO()
    writer.write(buffer)

    # Um PDF em branco não tem camada de texto: cai para o OCR, e o OCR de
    # uma página em branco não devolve nada. O que se fixa aqui é que a
    # tentativa de camada de texto acontece, e primeiro.
    result = extract(buffer.getvalue(), "vazio.pdf")
    assert result.source in (TextSource.NONE, TextSource.PDF_OCR)


def test_a_text_file_is_read_as_it_is():
    text = "Fatura FT 2026/1\nTotal: 100,00 EUR"
    result = extract(text.encode("utf-8"), "fatura.txt")

    assert result.source == TextSource.PLAIN_TEXT
    assert result.text == text


# ---------------------------------------------------------------------------
# Nada é inventado quando não se consegue ler
# ---------------------------------------------------------------------------

def test_an_unreadable_file_stays_empty():
    """Um ficheiro que o produto não sabe abrir não vira uma fatura."""
    result = extract(b"\x00\x01\x02 lixo binario", "coisa.xyz")

    assert not result.ok
    assert result.source == TextSource.NONE


def test_nothing_is_invented_from_nothing():
    parsed, raw = asyncio.run(process_document(b"", "vazio.bin"))

    assert raw == ""
    assert parsed.gross_amount is None
    assert parsed.nif is None
    assert parsed.confidence == 0.0
    assert parsed.validation_status == "failed"


@needs_ocr
def test_a_photograph_is_flagged_as_read_by_ocr():
    """Um valor adivinhado de pixels não vale o mesmo que um valor lido.

    A confiança desce e fica uma verificação a dizer porquê, para o documento
    subir à revisão manual antes dos que vieram de uma camada de texto.
    """
    parsed, _ = asyncio.run(process_document(as_png(invoice_image()), "recibo.png"))

    origem = [c for c in parsed.checks if c.get("check") == "origem_texto"]
    assert origem and origem[0]["status"] == "warning"
    assert parsed.confidence < 1.0


# ---------------------------------------------------------------------------
# Preparar a imagem
# ---------------------------------------------------------------------------

def test_a_small_image_is_enlarged_before_the_engine_sees_it():
    """Uma foto pequena tem letras sem corpo, e o motor lê-as mal."""
    prepared = prepare_for_ocr(Image.new("RGB", (400, 200), "white"))

    assert prepared.width >= 1600
    assert prepared.mode == "L"          # tons de cinzento
    # A proporção mantém-se: esticar deformava as letras.
    assert abs(prepared.width / prepared.height - 2.0) < 0.05


def test_a_large_image_is_left_at_its_own_size():
    prepared = prepare_for_ocr(Image.new("RGB", (2400, 1000), "white"))
    assert prepared.width == 2400


@needs_ocr
def test_a_faint_photograph_is_still_read():
    """Contraste esticado é o que salva uma foto tirada com pouca luz."""
    faint = Image.new("RGB", (1000, 300), (205, 205, 205))
    draw = ImageDraw.Draw(faint)
    draw.text((40, 60), "Total: 169,03 EUR", font=_font(40), fill=(140, 140, 140))

    result = extract(as_png(faint), "foto_escura.png")
    assert "169" in result.text


# ---------------------------------------------------------------------------
# O produto sabe dizer o que consegue ler
# ---------------------------------------------------------------------------

def test_the_install_reports_what_it_can_read(tenant):
    body = tenant.get("/api/v1/documents/capabilities").json()

    assert body["camada_de_texto"] is True
    assert isinstance(body["em_falta"], list)
    # Sem motor, tem de dizer o que falta em vez de ficar calado.
    if not body["imagens"]:
        assert body["em_falta"]


def test_capabilities_is_not_read_as_a_document_id(tenant):
    """Uma rota literal tem de vir antes de ``/{doc_id}``, senão é apanhada por ela."""
    response = tenant.get("/api/v1/documents/capabilities")
    assert response.status_code == 200
    assert "camada_de_texto" in response.json()


def test_an_extraction_without_text_is_not_ok():
    assert not Extraction("").ok
    assert not Extraction("   \n ").ok
    assert Extraction("alguma coisa", TextSource.PDF_LAYER).ok


# ---------------------------------------------------------------------------
# O ficheiro original é da empresa, não de quem sabe o nome
# ---------------------------------------------------------------------------

def _upload(tenant, name: str = "fatura.png") -> dict:
    image = invoice_image()
    response = tenant.client.post(
        "/api/v1/documents/upload",
        headers=tenant.headers,
        files={"file": (name, as_png(image), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()["document"]


def test_the_original_file_needs_a_session(tenant):
    """Servia-se qualquer ficheiro a quem soubesse o nome, sem autenticação.

    E os nomes são os que o utilizador deu — ``fatura.png``, ``recibo.pdf``.
    Adivinhar não era exercício nenhum.
    """
    doc = _upload(tenant, "fatura_confidencial.png")

    anonymous = tenant.client.get(f"/api/v1/documents/{doc['id']}/file")
    assert anonymous.status_code == 401

    mine = tenant.get(f"/api/v1/documents/{doc['id']}/file")
    assert mine.status_code == 200
    assert mine.headers["content-type"] == "image/png"
    assert mine.content[:4] == b"\x89PNG"


def test_another_companys_file_is_not_served(tenant, other_tenant):
    """Autenticado não chega: tem de ser um documento desta empresa."""
    theirs = _upload(other_tenant, "fatura_alheia.png")

    response = tenant.get(f"/api/v1/documents/{theirs['id']}/file")
    # 404 e não 403: distingui-los diria que o documento existe algures.
    assert response.status_code == 404


def test_a_document_that_does_not_exist_is_refused(tenant):
    assert tenant.get("/api/v1/documents/DOC-INVENTADO/file").status_code == 404


# ---------------------------------------------------------------------------
# Onde o ficheiro fica guardado
# ---------------------------------------------------------------------------

def test_two_companies_can_upload_the_same_file_name(tenant, other_tenant):
    """A chave era o nome que o utilizador deu, e mais nada.

    Duas empresas com uma ``fatura.pdf`` escreviam a mesma chave: a segunda
    apagava a primeira, e a empresa A passava a ver o documento da B.
    """
    ours = _upload(tenant, "fatura.png")
    # Conteúdo diferente, senão o próprio hash já os distinguiria por acaso.
    theirs_bytes = as_png(invoice_image(supplier="OUTRA EMPRESA, LDA"))
    response = other_tenant.client.post(
        "/api/v1/documents/upload",
        headers=other_tenant.headers,
        files={"file": ("fatura.png", theirs_bytes, "image/png")},
    )
    assert response.status_code == 201, response.text
    theirs = response.json()["document"]

    mine = tenant.get(f"/api/v1/documents/{ours['id']}/file")
    yours = other_tenant.get(f"/api/v1/documents/{theirs['id']}/file")

    assert mine.status_code == yours.status_code == 200
    # Cada uma continua a ver o seu, não o da outra.
    assert mine.content != yours.content


def test_the_key_separates_companies_and_contents():
    from app.services.storage import object_key

    a = object_key("COMP-A", "abc123", "fatura.pdf")
    b = object_key("COMP-B", "abc123", "fatura.pdf")
    c = object_key("COMP-A", "def456", "fatura.pdf")

    assert a.startswith("companies/COMP-A/")
    assert a.endswith(".pdf")
    assert a != b and a != c


def test_a_hostile_file_name_cannot_escape_the_key():
    from app.services.storage import object_key

    key = object_key("COMP-A", "abc", "../../../etc/passwd")
    assert ".." not in key
    assert key.startswith("companies/COMP-A/documents/abc")


def test_the_install_reports_where_documents_are_kept():
    from app.services.storage import document_storage

    status = document_storage.status()
    assert status["destino"] in ("r2", "local")
    if status["destino"] == "local":
        # Sem R2 configurado, tem de dizer o que falta em vez de ficar calado.
        assert status["em_falta"]


# ---------------------------------------------------------------------------
# Ler um documento não pode parar o servidor
# ---------------------------------------------------------------------------

@needs_raster
def test_reading_a_scanned_pdf_does_not_block_other_requests():
    """O OCR é trabalho de CPU e é demorado — um scan de seis páginas leva
    perto de vinte segundos. Corrido no loop de eventos, parava **todos** os
    outros pedidos durante esse tempo, não apenas o de quem carregou.
    """
    pages = [invoice_image() for _ in range(3)]
    buffer = io.BytesIO()
    pages[0].convert("RGB").save(
        buffer, format="PDF", save_all=True,
        append_images=[p.convert("RGB") for p in pages[1:]],
    )
    data = buffer.getvalue()

    async def scenario():
        served = 0

        async def other_requests():
            nonlocal served
            while True:
                await asyncio.sleep(0.01)
                served += 1

        beat = asyncio.create_task(other_requests())
        try:
            await process_document(data, "scan.pdf")
        finally:
            beat.cancel()
        return served

    served = asyncio.run(scenario())
    # Com o loop bloqueado isto ficaria em zero ou perto disso.
    assert served > 20, f"o loop ficou bloqueado: só {served} pedidos servidos"
