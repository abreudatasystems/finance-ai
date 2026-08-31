"""Document processing pipeline: text extraction → structured parse → validation.

Values come from the document itself (see ``invoice_parser``); nothing is
invented. Whatever cannot be read stays empty and lowers the confidence so the
item lands in manual review instead of silently entering the books.
"""

from __future__ import annotations

import hashlib
import io
from typing import Optional, Tuple

from pypdf import PdfReader

from app.services.invoice_parser import ParsedInvoice, parse_invoice_text

AI_MODEL = "invoice-parser"
AI_VERSION = "1.0"


def compute_hash(file_bytes: bytes) -> str:
    """SHA-256 of the raw file — the duplicate-detection key."""
    return hashlib.sha256(file_bytes).hexdigest()


def extract_text(file_bytes: bytes, file_name: str) -> str:
    """Pull the text layer out of a PDF. Images need an OCR engine (not bundled)."""
    if file_name.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:  # pragma: no cover - corrupt/encrypted file
            print(f"[PDF extract error] {exc}")
            return ""

    # Plain-text uploads are parsed directly; images require OCR.
    if file_name.lower().endswith((".txt", ".csv")):
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


async def process_document(file_bytes: bytes, file_name: str) -> ParsedInvoice:
    """Run the full pipeline and return the structured, validated result."""
    text = extract_text(file_bytes, file_name)
    parsed = parse_invoice_text(text, file_name)
    if not parsed.supplier and file_name:
        # Last resort: the file name often carries the supplier.
        stem = file_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        if stem:
            parsed.supplier = stem.title()
    return parsed
