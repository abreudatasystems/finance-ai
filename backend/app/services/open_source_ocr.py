"""Do ficheiro ao texto: a metade do OCR que nunca corria.

O parser (``invoice_parser``) sempre soube ler uma fatura portuguesa — o
fornecedor, o NIF, o número, as datas, a base, o IVA e o total, com validação
e confiança. O que lhe faltava era texto. Havia duas maneiras de um documento
não chegar lá, e são precisamente as duas mais comuns numa PME:

* **Uma foto de um recibo.** O código tinha um caminho para OCR de imagens,
  mas atrás de ``if HAS_PYTESSERACT`` — e o ``pytesseract`` não estava nas
  dependências nem o binário no Dockerfile. A condição era sempre falsa, a
  função caía até ao fim e devolvia ``""``.
* **Um PDF digitalizado.** Não havia rasterização nenhuma: sobre um PDF só se
  tentava extrair a camada de texto, e um PDF que é uma imagem lá dentro não
  tem camada de texto. Faltava o passo do meio — página → imagem → OCR — e
  sem ele nem instalar o motor resolvia.

O resultado era o mesmo nos dois casos: texto vazio, confiança 0%, documento
para revisão manual. Honesto — nada era inventado — mas a automação não
automatizava nada.

**A ordem por que se tenta, e porquê.** Ler a camada de texto é exacto e
custa milissegundos; o OCR é uma adivinha cara sobre pixels. Por isso a
camada de texto vem sempre primeiro, e o OCR só entra quando ela não existe
ou não diz nada. Um PDF emitido por software de faturação nunca chega a
passar pelo motor.

Cada extracção diz por que via foi obtida (``TextSource``), porque um número
lido de uma camada de texto e um número adivinhado de uma fotografia merecem
confiança diferente — e quem revê o documento tem o direito de saber qual é
qual.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

from pypdf import PdfReader
from PIL import Image, ImageOps

logger = logging.getLogger("financeai.ocr")

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:                                     # pragma: no cover
    HAS_PYTESSERACT = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:                                     # pragma: no cover
    HAS_PDFPLUMBER = False

try:
    import pypdfium2
    HAS_PDFIUM = True
except ImportError:                                     # pragma: no cover
    HAS_PDFIUM = False

from app.services.invoice_parser import ParsedInvoice, parse_invoice_text

AI_MODEL = "open-source-ocr-v2"
AI_VERSION = "2.0"

#: Português e inglês: metade das faturas de software que uma PME recebe vem
#: em inglês, e o Tesseract lê melhor quando lhe dizemos os dois.
OCR_LANGUAGES = "por+eng"

#: Pontos por polegada ao converter uma página de PDF em imagem. A 72 (o
#: natural do PDF) o texto pequeno fica ilegível; 300 é o que se usa para
#: digitalizar e é onde o Tesseract acerta. Acima disso só cresce o tempo.
RASTER_DPI = 300

#: Acima disto a imagem já tem resolução que chegue; abaixo, ampliar melhora
#: bastante o reconhecimento de uma fotografia tirada ao telemóvel.
MIN_OCR_WIDTH = 1600

#: Um PDF de 200 páginas não é uma fatura. Ler tudo com OCR levaria minutos e
#: seguraria o pedido; as faturas que interessam têm meia dúzia de páginas.
MAX_OCR_PAGES = 10

IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif")
TEXT_SUFFIXES = (".txt", ".csv", ".tsv", ".json", ".xml", ".html")


class TextSource:
    """Por que via o texto foi obtido. Determina o tecto da confiança."""

    PDF_LAYER = "pdf_text_layer"      # exacto: o emissor escreveu-o
    PDF_OCR = "pdf_ocr"              # adivinhado: o PDF era uma imagem
    IMAGE_OCR = "image_ocr"          # adivinhado: uma foto ou digitalização
    PLAIN_TEXT = "plain_text"
    NONE = "none"


@dataclass
class Extraction:
    """O texto e a história de como se lá chegou."""

    text: str
    source: str = TextSource.NONE
    pages: int = 0
    engine: Optional[str] = None

    @property
    def ok(self) -> bool:
        return bool(self.text.strip())

    @property
    def is_ocr(self) -> bool:
        return self.source in (TextSource.PDF_OCR, TextSource.IMAGE_OCR)


def compute_hash(file_bytes: bytes) -> str:
    """SHA-256 do ficheiro em bruto — a chave que apanha duplicados."""
    return hashlib.sha256(file_bytes).hexdigest()


# ─────────────────────────── o que está disponível ───────────────────────────

def engine_status() -> dict:
    """O que este servidor consegue mesmo ler.

    Serve para o produto poder dizer "não consigo ler fotografias nesta
    instalação" em vez de aceitar o ficheiro e devolver 0% sem explicação.
    """
    tesseract_version = None
    languages: List[str] = []
    if HAS_PYTESSERACT:
        try:
            tesseract_version = str(pytesseract.get_tesseract_version())
            languages = sorted(pytesseract.get_languages())
        except Exception as exc:                        # binário em falta
            logger.warning("pytesseract instalado mas o binário não responde: %s", exc)

    ocr_ready = bool(tesseract_version)
    return {
        "camada_de_texto": True,                        # pypdf chega sempre
        "layout_de_tabelas": HAS_PDFPLUMBER,
        "imagens": ocr_ready,
        "pdf_digitalizado": ocr_ready and HAS_PDFIUM,
        "motor": f"tesseract {tesseract_version}" if ocr_ready else None,
        "idiomas": [l for l in languages if l in ("por", "eng")],
        "em_falta": _missing(ocr_ready),
    }


def _missing(ocr_ready: bool) -> List[str]:
    gaps = []
    if not ocr_ready:
        gaps.append("tesseract-ocr (e tesseract-ocr-por) para ler imagens")
    if not HAS_PDFIUM:
        gaps.append("pypdfium2 para converter PDFs digitalizados em imagem")
    if not HAS_PDFPLUMBER:
        gaps.append("pdfplumber para ler tabelas com o alinhamento certo")
    return gaps


# ─────────────────────────── preparar a imagem ───────────────────────────

def prepare_for_ocr(image: Image.Image) -> Image.Image:
    """Uma fotografia não é uma digitalização, e o motor sente a diferença.

    Três coisas, por ordem de quanto valem: tons de cinzento (a cor não
    ajuda a distinguir letras e engana o limiar), ampliar até uma largura
    onde os caracteres tenham corpo, e esticar o contraste, que é o que
    salva uma foto tirada com pouca luz.
    """
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    grey = ImageOps.grayscale(image)

    if grey.width < MIN_OCR_WIDTH:
        scale = MIN_OCR_WIDTH / grey.width
        grey = grey.resize(
            (MIN_OCR_WIDTH, max(1, int(grey.height * scale))), Image.LANCZOS
        )

    # Corta 1% em cada extremo antes de esticar: sem isso, um único pixel
    # preto ou branco perdido decide o contraste da página toda.
    return ImageOps.autocontrast(grey, cutoff=1)


def ocr_image(image: Image.Image) -> str:
    """Texto de uma imagem, ou vazio quando o motor não está disponível."""
    if not HAS_PYTESSERACT:
        return ""
    prepared = prepare_for_ocr(image)
    for lang in (OCR_LANGUAGES, None):
        try:
            text = pytesseract.image_to_string(prepared, lang=lang) if lang \
                else pytesseract.image_to_string(prepared)
            if text.strip():
                return text
        except Exception as exc:
            # Sem o pacote `por` instalado, o primeiro tento falha e o
            # segundo — sem idioma — ainda lê. Só o segundo é que é notícia.
            if lang is None:
                logger.warning("OCR falhou: %s", exc)
    return ""


# ─────────────────────────── PDFs ───────────────────────────

def _pdf_text_layer(file_bytes: bytes) -> Tuple[str, int]:
    """A camada de texto, com o alinhamento quando o pdfplumber existe."""
    if HAS_PDFPLUMBER:
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                pages = [
                    (page.extract_text(layout=True) or page.extract_text() or "")
                    for page in pdf.pages
                ]
                joined = "\n\n".join(p for p in pages if p.strip())
                if joined.strip():
                    return joined, len(pdf.pages)
        except Exception as exc:
            logger.warning("pdfplumber não leu o PDF: %s", exc)

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        joined = "\n".join((page.extract_text() or "") for page in reader.pages)
        if joined.strip():
            return joined, len(reader.pages)
        return "", len(reader.pages)
    except Exception as exc:
        logger.warning("pypdf não leu o PDF: %s", exc)
        return "", 0


def _pdf_ocr(file_bytes: bytes) -> Tuple[str, int]:
    """Cada página como imagem, e cada imagem pelo motor.

    Este é o passo que faltava por inteiro. Um PDF digitalizado — o que sai
    de um multifunções, ou o que o contabilista reencaminha — é uma imagem
    dentro de um invólucro de PDF: não tem camada de texto para ler, e sem
    o converter em imagem primeiro não há motor de OCR que lhe toque.
    """
    if not (HAS_PDFIUM and HAS_PYTESSERACT):
        return "", 0

    try:
        document = pypdfium2.PdfDocument(file_bytes)
    except Exception as exc:
        logger.warning("pypdfium2 não abriu o PDF: %s", exc)
        return "", 0

    try:
        count = min(len(document), MAX_OCR_PAGES)
        pages = []
        for index in range(count):
            page = document[index]
            # A escala do pdfium é relativa a 72 dpi, o natural do formato.
            bitmap = page.render(scale=RASTER_DPI / 72)
            text = ocr_image(bitmap.to_pil())
            if text.strip():
                pages.append(text)
        return "\n\n".join(pages), count
    finally:
        document.close()


# ─────────────────────────── a extracção ───────────────────────────

def extract(file_bytes: bytes, file_name: str) -> Extraction:
    """Texto do ficheiro, dizendo por que via foi obtido."""
    lower = (file_name or "").lower()

    if lower.endswith(".pdf"):
        text, pages = _pdf_text_layer(file_bytes)
        if text.strip():
            return Extraction(text, TextSource.PDF_LAYER, pages,
                              "pdfplumber" if HAS_PDFPLUMBER else "pypdf")

        # Sem camada de texto: é um PDF digitalizado.
        text, pages = _pdf_ocr(file_bytes)
        if text.strip():
            return Extraction(text, TextSource.PDF_OCR, pages, "tesseract")
        return Extraction("", TextSource.NONE, pages)

    if lower.endswith(IMAGE_SUFFIXES):
        try:
            image = Image.open(io.BytesIO(file_bytes))
        except Exception as exc:
            logger.warning("não foi possível abrir a imagem: %s", exc)
            return Extraction("", TextSource.NONE)
        text = ocr_image(image)
        if text.strip():
            return Extraction(text, TextSource.IMAGE_OCR, 1, "tesseract")
        return Extraction("", TextSource.NONE, 1)

    if lower.endswith(TEXT_SUFFIXES):
        return Extraction(file_bytes.decode("utf-8", errors="ignore"),
                          TextSource.PLAIN_TEXT, 1)

    return Extraction("", TextSource.NONE)


def extract_text(file_bytes: bytes, file_name: str) -> str:
    """O texto e nada mais — para quem não precisa de saber de onde veio."""
    return extract(file_bytes, file_name).text


# ─────────────────────────── classificar ───────────────────────────

def suggest_category(parsed: ParsedInvoice, categories) -> Tuple[Optional[str], Optional[str]]:
    """Compara o documento com as categorias da própria empresa.

    ``categories`` é uma lista de linhas Category; a comparação é feita entre
    as palavras-chave e o nome da categoria e o que se leu do documento.
    """
    haystack = " ".join(filter(None, [parsed.supplier or "", parsed.document_number or ""])).lower()
    if not haystack.strip():
        return None, None

    best = None
    for cat in categories or []:
        keywords = [k.strip().lower() for k in (cat.keywords or "").split(",") if k.strip()]
        keywords.append((cat.name or "").lower())
        for kw in keywords:
            if kw and kw in haystack:
                # A palavra mais específica (mais longa) ganha.
                if best is None or len(kw) > best[0]:
                    best = (len(kw), cat)
    if best:
        return best[1].id, best[1].name
    return None, None


#: O OCR erra letras e números onde a camada de texto não erra. Um valor lido
#: de uma fotografia entra com menos confiança, para que documentos assim
#: subam à revisão manual antes dos outros — e não ao contrário.
OCR_CONFIDENCE_FACTOR = 0.85


async def process_document(file_bytes: bytes, file_name: str) -> Tuple[ParsedInvoice, str]:
    """O caminho todo, e devolve (ParsedInvoice, texto em bruto).

    A extracção vai para um thread. É trabalho de CPU e é demorado — um PDF
    digitalizado de seis páginas leva perto de vinte segundos a 300 dpi — e
    correr isso no loop de eventos parava **todos** os outros pedidos durante
    esse tempo, não apenas o de quem carregou o ficheiro.
    """
    extraction = await asyncio.to_thread(extract, file_bytes, file_name)
    parsed = parse_invoice_text(extraction.text, file_name)

    if extraction.is_ocr and parsed.confidence:
        parsed.confidence = round(parsed.confidence * OCR_CONFIDENCE_FACTOR, 4)
        parsed.checks.append({
            "check": "origem_texto",
            "label": "Lido por OCR",
            "status": "warning",
            "detail": (
                "O texto foi reconhecido a partir de uma imagem, não lido de "
                "uma camada de texto. Confirme os valores antes de aprovar."
            ),
        })

    if not parsed.supplier and file_name:
        # Último recurso: o nome do ficheiro traz muitas vezes o fornecedor.
        stem = file_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        if stem:
            parsed.supplier = stem.title()

    return parsed, extraction.text
