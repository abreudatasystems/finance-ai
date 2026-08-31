"""Structured invoice parsing from raw document text.

Replaces the previous hard-coded lookup: values are read from the document
itself. Every field is optional — what could not be read stays ``None`` and
lowers the confidence, instead of being invented.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional, List, Dict, Any

CENTS = Decimal("0.01")

# Portuguese VAT rates (mainland + islands) used to recognise a plausible rate.
KNOWN_VAT_RATES = [0, 4, 5, 6, 9, 12, 13, 16, 18, 22, 23]

_AMOUNT = r"(\d{1,3}(?:[.,\s\u00a0]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)"


def _to_decimal(raw: str) -> Optional[Decimal]:
    """Parse a money token written in either PT (1.234,56) or EN (1,234.56) style."""
    if not raw:
        return None
    txt = raw.strip().replace(" ", "").replace(" ", "")
    if "," in txt and "." in txt:
        # The right-most separator is the decimal one.
        if txt.rfind(",") > txt.rfind("."):
            txt = txt.replace(".", "").replace(",", ".")
        else:
            txt = txt.replace(",", "")
    elif "," in txt:
        # A single comma followed by exactly three digits is a thousands
        # separator (1,234), otherwise it is the decimal comma (406,50).
        txt = txt.replace(",", "") if re.fullmatch(r"\d+,\d{3}", txt) else txt.replace(",", ".")
    elif "." in txt:
        if re.fullmatch(r"\d+\.\d{3}", txt):
            txt = txt.replace(".", "")
    try:
        return Decimal(txt).quantize(CENTS, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None


def _search_amount(text: str, patterns: List[str]) -> Optional[Decimal]:
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            value = _to_decimal(m.group(1))
            if value is not None:
                return value
    return None


def _parse_date(raw: str) -> Optional[str]:
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _search_date(text: str, labels: List[str]) -> Optional[str]:
    date_token = r"(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4})"
    for label in labels:
        m = re.search(rf"{label}[^\n\d]{{0,20}}{date_token}", text, re.IGNORECASE)
        if m:
            parsed = _parse_date(m.group(1))
            if parsed:
                return parsed
    return None


@dataclass
class ParsedInvoice:
    supplier: Optional[str] = None
    nif: Optional[str] = None
    document_number: Optional[str] = None
    document_type: str = "invoice"
    document_date: Optional[str] = None
    due_date: Optional[str] = None
    net_amount: Optional[Decimal] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[Decimal] = None
    gross_amount: Optional[Decimal] = None
    currency: str = "EUR"
    confidence: float = 0.0
    validation_status: str = "needs_review"
    checks: List[Dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        for k in ("net_amount", "vat_amount", "gross_amount"):
            if d[k] is not None:
                d[k] = float(d[k])
        return d


def _detect_document_type(text: str) -> str:
    lowered = text.lower()
    if "nota de crédito" in lowered or "nota de credito" in lowered or "credit note" in lowered:
        return "credit_note"
    if "nota de débito" in lowered or "nota de debito" in lowered:
        return "debit_note"
    if "fatura-recibo" in lowered or "fatura recibo" in lowered:
        return "invoice_receipt"
    if "recibo" in lowered or "receipt" in lowered:
        return "receipt"
    return "invoice"


def _guess_supplier(text: str) -> Optional[str]:
    """The issuer name is conventionally the first meaningful line of the page."""
    skip = ("fatura", "invoice", "recibo", "nota de", "duplicado", "original", "página", "page")
    for line in text.splitlines():
        candidate = line.strip()
        if len(candidate) < 3 or len(candidate) > 80:
            continue
        low = candidate.lower()
        if any(low.startswith(s) for s in skip):
            continue
        if re.fullmatch(r"[\d\s.,:/-]+", candidate):
            continue
        return candidate
    return None


def parse_invoice_text(text: str, file_name: str = "") -> ParsedInvoice:
    """Extract structured invoice data from raw text. Never invents values."""
    result = ParsedInvoice()
    text = text or ""

    if not text.strip():
        result.checks.append({"check": "texto_documento", "ok": False,
                              "detail": "Nenhum texto legível extraído do ficheiro"})
        result.confidence = 0.0
        result.validation_status = "failed"
        return result

    result.document_type = _detect_document_type(text)
    result.supplier = _guess_supplier(text)

    # NIF / VAT number — Portuguese (9 digits) or EU-prefixed.
    nif_match = re.search(
        r"(?:NIF|NIPC|N\.?I\.?F\.?|Contribuinte|VAT(?:\s*(?:No|Number))?)"
        r"[^\n\dA-Z]{0,10}([A-Z]{0,2}[\d][\d\s.]{6,15}[A-Z]?)(?=\s|$)",
        text, re.IGNORECASE)
    if nif_match:
        result.nif = re.sub(r"[\s.]", "", nif_match.group(1)).upper()

    # Invoice number — e.g. "FT 2026/00452", "Fatura nº 123".
    num_match = re.search(
        r"(?:fatura|factura|invoice|recibo|documento|nota)\s*[^\n]{0,20}?\n?\s*"
        r"(?:n[.ºo°]{0,2}|number|#)\s*[:\-]?\s*([A-Z]{0,4}\s?[\w/\-]*\d[\w/\-]*)",
        text, re.IGNORECASE)
    if num_match:
        candidate = num_match.group(1).strip()
        if any(ch.isdigit() for ch in candidate) and len(candidate) <= 32:
            result.document_number = candidate

    result.document_date = _search_date(text, [r"data\s*(?:de\s*)?(?:emiss[ãa]o)?", r"date", r"emitid[oa]\s*em"])
    result.due_date = _search_date(text, [r"vencimento", r"due\s*date", r"pagamento\s*at[ée]", r"validade"])

    if re.search(r"\bUSD\b|\$", text):
        result.currency = "USD"
    elif re.search(r"\bGBP\b|£", text):
        result.currency = "GBP"

    # --- Amounts ---
    result.gross_amount = _search_amount(text, [
        rf"\btotal\s*(?:a\s*pagar|geral|c/\s*iva|com\s*iva|due|due\s*now)?\s*[:\-]?\s*(?:€|EUR)?\s*{_AMOUNT}",
        rf"(?:€|EUR)\s*{_AMOUNT}\s*(?:\btotal)",
        rf"amount\s*due\s*[:\-]?\s*(?:€|EUR)?\s*{_AMOUNT}",
    ])
    result.net_amount = _search_amount(text, [
        rf"\b(?:total\s*)?(?:il[ií]quido|base\s*tribut[áa]vel|sub-?total|valor\s*sem\s*iva|net(?:\s*amount)?)\s*[:\-]?\s*(?:€|EUR)?\s*{_AMOUNT}",
        rf"incid[êe]ncia\s*[:\-]?\s*(?:€|EUR)?\s*{_AMOUNT}",
    ])
    result.vat_amount = _search_amount(text, [
        rf"\b(?:total\s*(?:de\s*)?)?(?:iva|v\.?a\.?t\.?|imposto)\b\s*(?:\(?\s*\d{{1,2}}(?:[.,]\d+)?\s*%\s*\)?)?\s*[:\-]?\s*(?:€|EUR)?\s*{_AMOUNT}",
    ])

    rate_match = re.search(r"(?:iva|vat|taxa)\D{0,12}(\d{1,2})(?:[.,]\d+)?\s*%", text, re.IGNORECASE)
    if rate_match:
        try:
            rate = int(rate_match.group(1))
            if rate in KNOWN_VAT_RATES:
                result.vat_rate = float(rate)
        except ValueError:
            pass

    _complete_amounts(result)
    _validate(result)
    return result


def _complete_amounts(r: ParsedInvoice) -> None:
    """Fill in whichever leg of net/vat/gross is missing, when derivable."""
    if r.gross_amount is not None and r.net_amount is not None and r.vat_amount is None:
        r.vat_amount = (r.gross_amount - r.net_amount).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif r.gross_amount is not None and r.vat_amount is not None and r.net_amount is None:
        r.net_amount = (r.gross_amount - r.vat_amount).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif r.net_amount is not None and r.vat_amount is not None and r.gross_amount is None:
        r.gross_amount = (r.net_amount + r.vat_amount).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif r.gross_amount is not None and r.vat_rate:
        rate = Decimal(str(r.vat_rate)) / Decimal("100")
        r.net_amount = (r.gross_amount / (Decimal("1") + rate)).quantize(CENTS, rounding=ROUND_HALF_UP)
        r.vat_amount = (r.gross_amount - r.net_amount).quantize(CENTS, rounding=ROUND_HALF_UP)

    # Derive the rate from the amounts when it was not printed explicitly.
    if r.vat_rate is None and r.net_amount and r.vat_amount is not None and r.net_amount > 0:
        implied = (r.vat_amount / r.net_amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        if int(implied) in KNOWN_VAT_RATES:
            r.vat_rate = float(implied)


def _validate(r: ParsedInvoice) -> None:
    """Run the checklist and turn it into a confidence score."""
    checks: List[Dict[str, Any]] = []

    def add(name: str, ok: bool, detail: str = "", weight: float = 1.0, critical: bool = False):
        checks.append({"check": name, "ok": ok, "detail": detail, "weight": weight, "critical": critical})

    add("fornecedor_encontrado", bool(r.supplier), r.supplier or "Não identificado", 1.0)
    add("nif_valido", _valid_nif(r.nif), r.nif or "Não encontrado", 1.0)
    add("numero_documento", bool(r.document_number), r.document_number or "Não encontrado", 1.0)
    add("data_valida", bool(r.document_date), r.document_date or "Não encontrada", 1.5, critical=True)

    due_ok = True
    if r.due_date and r.document_date:
        due_ok = r.due_date >= r.document_date
    add("vencimento_valido", due_ok,
        r.due_date or "Não encontrado (assume data do documento)", 0.5)

    positive = bool(r.gross_amount and r.gross_amount > 0)
    add("valor_positivo", positive,
        f"{r.gross_amount}" if r.gross_amount is not None else "Não encontrado", 2.0, critical=True)

    vat_ok = r.vat_amount is not None
    add("iva_encontrado", vat_ok,
        f"{r.vat_amount}" if r.vat_amount is not None else "Não encontrado", 1.0)

    totals_ok = False
    if r.net_amount is not None and r.vat_amount is not None and r.gross_amount is not None:
        totals_ok = abs((r.net_amount + r.vat_amount) - r.gross_amount) <= Decimal("0.02")
    add("totais_coerentes", totals_ok,
        "líquido + IVA = total" if totals_ok else "Soma não confere ou valores em falta", 2.0, critical=True)

    rate_ok = r.vat_rate is None or int(r.vat_rate) in KNOWN_VAT_RATES
    add("taxa_iva_plausivel", rate_ok, f"{r.vat_rate}%" if r.vat_rate is not None else "N/D", 0.5)

    total_weight = sum(c["weight"] for c in checks)
    gained = sum(c["weight"] for c in checks if c["ok"])
    r.confidence = round(gained / total_weight, 3) if total_weight else 0.0
    r.checks = checks

    failed_critical = [c for c in checks if c["critical"] and not c["ok"]]
    if failed_critical:
        r.validation_status = "failed"
    elif r.confidence >= 0.90:
        r.validation_status = "valid"
    else:
        r.validation_status = "needs_review"


def _valid_nif(nif: Optional[str]) -> bool:
    """Validate a Portuguese NIF checksum; accept other EU VAT ids structurally."""
    if not nif:
        return False
    digits = re.sub(r"\D", "", nif)
    if nif.upper().startswith("PT") or len(digits) == 9:
        if len(digits) != 9:
            return False
        total = sum(int(d) * (9 - i) for i, d in enumerate(digits[:8]))
        check = 11 - (total % 11)
        if check >= 10:
            check = 0
        return check == int(digits[8])
    return len(digits) >= 6
