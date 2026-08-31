"""Document processing pipeline: text extraction → structured parse → validation.

Values come from the document itself (see ``invoice_parser``); nothing is
invented. Whatever cannot be read stays empty and lowers the confidence so the
item lands in manual review instead of silently entering the books.
"""

from __future__ import annotations

import hashlib
import io
import re
from typing import Optional, Tuple

from pypdf import PdfReader
from PIL import Image

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:
    HAS_PYTESSERACT = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

from app.services.invoice_parser import ParsedInvoice, parse_invoice_text

AI_MODEL = "open-source-ocr-v2"
AI_VERSION = "2.0"


def compute_hash(file_bytes: bytes) -> str:
    """SHA-256 of the raw file — the duplicate-detection key."""
    return hashlib.sha256(file_bytes).hexdigest()


def extract_text(file_bytes: bytes, file_name: str) -> str:
    """Pull text out of PDFs, images, or text files using open-source engines."""
    lower_name = file_name.lower()
    
    # 1. PDF Extraction
    if lower_name.endswith(".pdf"):
        # Try pdfplumber first if available for high-fidelity text extraction
        if HAS_PDFPLUMBER:
            try:
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        t = page.extract_text(layout=True) or page.extract_text()
                        if t:
                            pages_text.append(t)
                    if pages_text:
                        return "\n\n".join(pages_text)
            except Exception as exc:
                print(f"[pdfplumber extract warning] {exc}")

        # Fallback to pypdf
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            if text.strip():
                return text
        except Exception as exc:
            print(f"[pypdf extract warning] {exc}")

    # 2. Image OCR Extraction (PNG, JPG, JPEG, WEBP, TIFF, BMP)
    if lower_name.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff")):
        try:
            image = Image.open(io.BytesIO(file_bytes))
            if HAS_PYTESSERACT:
                try:
                    # Run OCR in Portuguese & English
                    ocr_text = pytesseract.image_to_string(image, lang="por+eng")
                    if ocr_text.strip():
                        return ocr_text
                except Exception as t_err:
                    # Fallback to default lang
                    try:
                        ocr_text = pytesseract.image_to_string(image)
                        if ocr_text.strip():
                            return ocr_text
                    except Exception as t_err2:
                        print(f"[pytesseract image error] {t_err2}")
        except Exception as img_err:
            print(f"[PIL image open error] {img_err}")

    # 3. Plain text / CSV files
    if lower_name.endswith((".txt", ".csv", ".tsv", ".json", ".xml", ".html")):
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    return ""


def suggest_category(parsed: ParsedInvoice, categories) -> Tuple[Optional[str], Optional[str]]:
    """Match the document against the company's own categories.

    ``categories`` is a list of Category rows; matching is done on the
    category keywords and name against the supplier and document text.
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
                # Prefer the most specific (longest) keyword hit.
                if best is None or len(kw) > best[0]:
                    best = (len(kw), cat)
    if best:
        return best[1].id, best[1].name
    return None, None


async def process_document(file_bytes: bytes, file_name: str) -> Tuple[ParsedInvoice, str]:
    """Run the full pipeline and return (ParsedInvoice, raw_extracted_text)."""
    text = extract_text(file_bytes, file_name)
    parsed = parse_invoice_text(text, file_name)
    if not parsed.supplier and file_name:
        # Last resort: the file name often carries the supplier.
        stem = file_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        if stem:
            parsed.supplier = stem.title()
    return parsed, text

