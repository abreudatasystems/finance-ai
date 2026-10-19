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
import os
import re
import shutil
from dataclasses import dataclass
from typing import List, Optional, Tuple

from pypdf import PdfReader
from PIL import Image, ImageFilter, ImageMath, ImageOps

logger = logging.getLogger("financeai.ocr")

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:                                     # pragma: no cover
    HAS_PYTESSERACT = False

try:
    # Fotografias de iPhone (HEIC). Sem o pacote, essas fotos não abrem.
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HAS_HEIF = True
except ImportError:                                     # pragma: no cover
    HAS_HEIF = False


def _configure_tesseract() -> None:
    """Encontrar o motor e o português sem configuração à mão.

    No Docker o binário está no PATH. No Windows o instalador põe-no em
    Program Files, fora do PATH, e o pacote de português de maior precisão
    fica numa pasta do utilizador. TESSERACT_CMD e TESSDATA_DIR mandam.
    """
    if not HAS_PYTESSERACT:
        return
    candidates = [
        os.getenv("TESSERACT_CMD"),
        shutil.which("tesseract"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        os.path.join(os.getenv("LOCALAPPDATA", ""), "Programs", "Tesseract-OCR", "tesseract.exe"),
    ]
    for cmd in candidates:
        if cmd and os.path.exists(cmd):
            pytesseract.pytesseract.tesseract_cmd = cmd
            break
    tessdata = os.getenv("TESSDATA_DIR") or os.path.join(os.getenv("LOCALAPPDATA", ""), "FinanceAI", "tessdata")
    if tessdata and os.path.isdir(tessdata) and not os.getenv("TESSDATA_PREFIX"):
        os.environ["TESSDATA_PREFIX"] = tessdata


_configure_tesseract()

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

IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif", ".heic", ".heif")

#: Uma foto de 12 megapixels não lê melhor do que uma de 3000 px de largura,
#: e demora quatro vezes mais. Acima disto reduz-se.
MAX_OCR_WIDTH = 3000

#: Uma leitura com esta confiança média (e palavras suficientes) já é boa:
#: não vale a pena tentar as outras preparações da imagem.
GOOD_ENOUGH_CONFIDENCE = 85
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
    onde os caracteres tenham corpo (ou reduzir uma foto enorme, que não lê
    melhor e demora muito mais), e esticar o contraste, que é o que salva
    uma foto tirada com pouca luz.
    """
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    grey = ImageOps.grayscale(image)

    if grey.width < MIN_OCR_WIDTH or grey.width > MAX_OCR_WIDTH:
        target = MIN_OCR_WIDTH if grey.width < MIN_OCR_WIDTH else MAX_OCR_WIDTH
        scale = target / grey.width
        grey = grey.resize((target, max(1, int(grey.height * scale))), Image.LANCZOS)

    # Corta 1% em cada extremo antes de esticar: sem isso, um único pixel
    # preto ou branco perdido decide o contraste da página toda.
    return ImageOps.autocontrast(grey, cutoff=1)


def remove_shadows(grey: Image.Image) -> Image.Image:
    """Uniformizar a luz de uma foto: sombra da mão, canto escuro, papel amarelo.

    Estima-se o "papel sem letras" — reduzindo a imagem, alargando o claro
    (o MaxFilter apaga o texto, que é fino e escuro) e desfocando — e divide-se
    a foto por ele. O papel fica branco por igual e o texto escuro em toda a
    página, com ou sem sombra por cima.
    """
    small = grey.resize((max(1, grey.width // 8), max(1, grey.height // 8)), Image.BILINEAR)
    background = small.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(4))
    background = background.resize(grey.size, Image.BILINEAR)
    flat = ImageMath.lambda_eval(
        lambda a: a["convert"](a["min"](a["g"] * 255 / (a["b"] + 1), 255), "L"),
        g=grey, b=background,
    )
    return ImageOps.autocontrast(flat, cutoff=1)


def binarize(grey: Image.Image, threshold: int = 170) -> Image.Image:
    """Preto e branco puros, a partir de uma imagem já sem sombras."""
    return grey.point(lambda v: 255 if v > threshold else 0, mode="L")


def straighten(image: Image.Image) -> Image.Image:
    """Uma foto tirada de lado ou de pernas para o ar.

    Primeiro a orientação que o telemóvel gravou (EXIF) — o caso mais comum,
    e não custa nada. Depois o próprio motor diz se o texto está a 90, 180
    ou 270 graus; só se roda quando ele tem a certeza.
    """
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:                                   # EXIF estragado
        pass
    if not HAS_PYTESSERACT:
        return image
    try:
        # O motor só reconhece a orientação numa imagem já sem sombras: na
        # foto crua a sombra parece texto e ele responde "0 graus" sem certeza.
        probe = remove_shadows(prepare_for_ocr(image))
        osd = pytesseract.image_to_osd(probe, output_type=pytesseract.Output.DICT)
        angle = int(osd.get("rotate", 0))
        if angle and float(osd.get("orientation_conf", 0)) >= 2.0:
            image = image.rotate(-angle, expand=True)
    except Exception:
        pass                                            # pouco texto para decidir
    return image


#: Abaixo disto uma "palavra" é quase sempre uma mancha, uma sombra ou um
#: pedaço de papel lido como letras — deita-se fora.
MIN_WORD_CONFIDENCE = 45


def _read(image: Image.Image, lang: Optional[str], psm: int) -> Tuple[str, float, int]:
    """Texto, confiança média e número de palavras de uma leitura.

    Só contam as palavras lidas com alguma confiança: sem esse filtro o
    lixo ia parar ao fim das linhas ("EDP Comercial, S.A. : ea : 0 en") e
    o nome do fornecedor saía estragado."""
    kwargs = {"config": f"--psm {psm}", "output_type": pytesseract.Output.DICT}
    if lang:
        kwargs["lang"] = lang
    data = pytesseract.image_to_data(image, **kwargs)

    lines: dict = {}
    confidences = []
    for i, word in enumerate(data["text"]):
        word = (word or "").strip()
        conf = float(data["conf"][i])
        if not word or conf < MIN_WORD_CONFIDENCE:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
        confidences.append(conf)
    text = "\n".join(" ".join(words) for _, words in sorted(lines.items()))
    mean = sum(confidences) / len(confidences) if confidences else 0.0
    return text, mean, len(confidences)


def ocr_image(image: Image.Image) -> str:
    """Texto de uma imagem, ou vazio quando o motor não está disponível.

    Uma foto pode sair melhor com o contraste esticado, sem sombras, ou a
    preto e branco — depende da luz. Tenta-se pela ordem do mais barato e
    fica a leitura com mais palavras lidas com confiança; uma leitura já boa
    à primeira dispensa as outras.
    """
    if not HAS_PYTESSERACT:
        return ""
    image = straighten(image)
    base = prepare_for_ocr(image)

    def variants():
        # psm 3/4 seguem as colunas da página e ignoram manchas soltas; o 6
        # (um bloco só) junta a sombra às linhas e fica para o fim.
        flat = remove_shadows(base)
        yield flat, 3
        yield binarize(flat), 3
        yield base, 4
        yield flat, 6

    best_text, best_score = "", -1.0
    # Sem o português instalado, tenta-se sem idioma (lê, mas pior).
    languages = (OCR_LANGUAGES,) if _has_portuguese() else (None,)
    for lang in languages:
        try:
            for variant, psm in variants():
                text, mean, words = _read(variant, lang, psm)
                # Muitas palavras com confiança: 3 palavras a 95% não valem
                # mais do que 80 palavras a 85%.
                score = mean * min(words, 150)
                if score > best_score and text.strip():
                    best_text, best_score = text, score
                if mean >= GOOD_ENOUGH_CONFIDENCE and words >= 15:
                    break
            if best_text.strip():
                return best_text
        except Exception as exc:
            logger.warning("OCR falhou: %s", exc)
    return best_text


_PORTUGUESE: Optional[bool] = None


def _has_portuguese() -> bool:
    """O pacote `por` está instalado? Pergunta-se ao motor uma vez."""
    global _PORTUGUESE
    if _PORTUGUESE is None:
        try:
            _PORTUGUESE = "por" in pytesseract.get_languages()
        except Exception:
            _PORTUGUESE = False
    return _PORTUGUESE


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

def suggest_category(parsed: ParsedInvoice, categories, text: str = "") -> Tuple[Optional[str], Optional[str]]:
    """Compara o documento com as categorias da própria empresa.

    ``categories`` é uma lista de linhas Category; a comparação é feita entre
    as palavras-chave e o nome da categoria e o que se leu do documento.
    Primeiro o fornecedor (o sinal mais forte); se não chegar, o que foi
    faturado — "TAXA MUNICIPAL TURÍSTICA" diz a categoria mesmo quando o
    nome do emissor não diz.
    """
    def match(haystack: str):
        best = None
        for cat in categories or []:
            keywords = [k.strip().lower() for k in (cat.keywords or "").split(",") if k.strip()]
            keywords.append((cat.name or "").lower())
            for kw in keywords:
                # Palavra inteira: "taxa" não pode casar dentro de "taxativo".
                if kw and len(kw) >= 3 and re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", haystack):
                    # A palavra mais específica (mais longa) ganha.
                    if best is None or len(kw) > best[0]:
                        best = (len(kw), cat)
        return best

    head = " ".join(filter(None, [parsed.supplier or "", parsed.document_number or ""])).lower()
    best = match(head) if head.strip() else None
    if not best and text:
        # Sem as linhas que todas as faturas têm ("Mercadoria/Serviços",
        # "Quadro Resumo de Impostos", totais, descontos): diriam "Mercadorias"
        # ou "Impostos" de qualquer documento.
        body = "\n".join(
            line for line in text[:6000].splitlines()
            if not re.search(r"mercadoria\s*/\s*servi|quadro\s+resumo|total|desconto|portes|"
                             r"adiantamento|acerto|incid|motivo\s+isen|programa\s+certificado|"
                             # "Vencimento" é a data, não o salário.
                             r"vencimento|data\s+limite|condi[çc][ãa]o\s+(?:de\s+)?pagamento",
                             line, re.IGNORECASE)
        )
        best = match(body.lower())
    if best:
        return best[1].id, best[1].name
    return None, None


#: O OCR erra letras e números onde a camada de texto não erra. Um valor lido
#: de uma fotografia entra com menos confiança, para que documentos assim
#: subam à revisão manual antes dos outros — e não ao contrário.
OCR_CONFIDENCE_FACTOR = 0.85


async def process_document(file_bytes: bytes, file_name: str, own_nif: Optional[str] = None,
                           own_name: Optional[str] = None) -> Tuple[ParsedInvoice, str]:
    """O caminho todo, e devolve (ParsedInvoice, texto em bruto).

    A extracção vai para um thread. É trabalho de CPU e é demorado — um PDF
    digitalizado de seis páginas leva perto de vinte segundos a 300 dpi — e
    correr isso no loop de eventos parava **todos** os outros pedidos durante
    esse tempo, não apenas o de quem carregou o ficheiro.
    """
    extraction = await asyncio.to_thread(extract, file_bytes, file_name)
    parsed = parse_invoice_text(extraction.text, file_name, own_nif=own_nif, own_name=own_name)

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
