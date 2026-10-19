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
    # Comprovativo bancário (Caixadirecta, BCP, transferência): prova de um
    # pagamento já feito, não uma fatura por pagar.
    if "comprovativo" in lowered:
        return "receipt"
    # "Fatura" ganha a "recibo": muitas faturas dizem no rodapé "este
    # documento serve de recibo após boa cobrança".
    if re.search(r"\bfa(?:c)?tura\b|\binvoice\b|\bFT\s", text, re.IGNORECASE):
        return "invoice"
    if "recibo" in lowered or "receipt" in lowered:
        return "receipt"
    return "invoice"


#: Linhas que nunca são o nome de quem emite: paginação, cabeçalhos, a
#: saudação ao cliente, identificadores e datas.
_NOT_A_NAME = (
    "fatura", "factura", "invoice", "recibo", "nota de", "duplicado", "original",
    "triplicado", "página", "pág", "pag.", "page", "id:", "data", "exmo", "exma",
    "comprovativo", "segunda via", "2ª via", "cópia", "copia", "documento",
    "nif", "contribuinte", "telef", "tel.", "fax", "www.", "http", "email", "e-mail",
)


def _looks_like_name(candidate: str) -> bool:
    if len(candidate) < 3 or len(candidate) > 80:
        return False
    low = candidate.lower()
    if any(low.startswith(s) for s in _NOT_A_NAME):
        return False
    if "@" in candidate or re.fullmatch(r"[\d\s.,:/()-]+", candidate):
        return False
    # Precisa de letras a sério, não só códigos ("2644-001", "ObbK-123").
    return len(re.findall(r"[A-Za-zÀ-ÿ]", candidate)) >= 3


def _clean_line(line: str) -> str:
    """Uma linha com o texto da esquerda: em PDFs paginados a coluna da
    direita (o cliente) vem na mesma linha, separada por muitos espaços."""
    return re.split(r"\s{4,}", line.strip())[0].strip(" ,;")


def _guess_supplier(text: str, own_names: tuple = ()) -> Optional[str]:
    """Quem emite.

    1. Num comprovativo de pagamento, a entidade ou o beneficiário.
    2. Numa fatura, o nome logo acima do NIF do emissor — é assim que todas
       as faturas portuguesas abrem (nome, NIF, morada).
    3. Senão, a primeira linha com cara de nome.
    """
    payee = re.search(
        r"(?:^|\n)\s*(?:entidade|benefici[áa]rio|destinat[áa]rio|nome\s+do\s+benefici[áa]rio)"
        r"[ \t]*[:\-]?[ \t]*(?:\d{3,6}[ \t]+)?([^\n]{3,80})",
        text, re.IGNORECASE)
    if payee:
        name = _clean_line(payee.group(1))
        if _looks_like_name(name):
            return name

    lines = text.splitlines()
    for i, line in enumerate(lines):
        if re.search(r"\b(?:NIF|NIPC|contribuinte)\b", line, re.IGNORECASE):
            for j in range(i - 1, max(-1, i - 4), -1):
                candidate = _clean_line(lines[j])
                if _looks_like_name(candidate) and candidate.lower() not in own_names:
                    return candidate
            break

    for line in lines:
        candidate = _clean_line(line)
        if _looks_like_name(candidate) and candidate.lower() not in own_names:
            return candidate
    return None


_NIF_LABEL = (
    r"(?:NIF|NIPC|N\.?I\.?F\.?|Contribuinte|VAT(?:\s*(?:No|Number|ID))?)"
    r"(?:\s*n\.?\s*[ºo°]\.?)?"                      # "Contribuinte N.º"
    r"[^\n\dA-Z]{0,10}([A-Z]{0,2}[\d][\d\s.]{6,15}[A-Z]?)(?=\s|$|,|;)"
)


def _find_nif(text: str, own_nif: Optional[str]) -> Optional[str]:
    """O primeiro NIF válido que não seja o da própria empresa.

    Num comprovativo bancário o primeiro NIF é o de quem paga — nós."""
    own = re.sub(r"\D", "", own_nif or "")
    fallback = None
    for match in re.finditer(_NIF_LABEL, text, re.IGNORECASE):
        nif = re.sub(r"[\s.]", "", match.group(1)).upper()
        if own and re.sub(r"\D", "", nif) == own:
            continue
        # "pedido efectuado por EMPRESA, contribuinte nº …" / "Ordenante": é
        # quem paga, não quem recebe.
        before = text[max(0, match.start() - 90):match.start()].lower()
        if re.search(r"efe(?:c)?tuado\s+por|ordenante|pagador", before):
            continue
        if _valid_nif(nif):
            return nif
        fallback = fallback or nif
    return fallback


def _below(text: str, label: str, value_pattern: str) -> Optional[str]:
    """O valor por baixo de um título numa tabela.

    Faturas de programas como o PRIMAVERA ou o PHC põem os títulos numa linha
    ("Data  Vencimento") e os valores na seguinte, alinhados à coluna. O
    texto vem com o alinhamento (pdfplumber), por isso procura-se na linha de
    baixo o valor que fica debaixo do título.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines[:-1]):
        for m in re.finditer(label, line, re.IGNORECASE):
            start, end = m.start(), m.end()
            for nxt in lines[i + 1:i + 3]:
                if not nxt.strip():
                    continue
                for v in re.finditer(value_pattern, nxt):
                    # Sobrepõe-se à coluna do título (com folga).
                    if v.start() <= end + 6 and v.end() >= start - 6:
                        return v.group(0)
                break
    return None


_DATE_TOKEN = r"\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b"


def _first_date(text: str) -> Optional[str]:
    for m in re.finditer(_DATE_TOKEN, text):
        parsed = _parse_date(m.group(0))
        if parsed and "2000" <= parsed[:4] <= "2100":
            return parsed
    return None


def _last_amount(text: str, patterns: List[str]) -> Optional[Decimal]:
    """O último valor que corresponde — os totais de uma fatura vêm no fim."""
    found = None
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            value = _to_decimal(m.group(1))
            if value is not None:
                found = value
        if found is not None:
            return found
    return None


_CURRENCY = r"(?:\(?\s*(?:€|EUR)\s*\)?)?"


def parse_invoice_text(text: str, file_name: str = "", own_nif: Optional[str] = None,
                       own_name: Optional[str] = None) -> ParsedInvoice:
    """Extract structured invoice data from raw text. Never invents values.

    ``own_nif`` e ``own_name`` são os da empresa que recebe o documento: nunca
    são o fornecedor (num comprovativo de pagamento aparecem primeiro)."""
    result = ParsedInvoice()
    text = text or ""

    if not text.strip():
        result.checks.append({"check": "texto_documento", "ok": False,
                              "detail": "Nenhum texto legível extraído do ficheiro"})
        result.confidence = 0.0
        result.validation_status = "failed"
        return result

    own_names = tuple(n.lower() for n in (own_name,) if n)
    result.document_type = _detect_document_type(text)
    result.supplier = _guess_supplier(text, own_names)
    result.nif = _find_nif(text, own_nif)

    # Número: primeiro o identificador do software certificado (tipo, série e
    # número — "FT 2026/004512", "FR A/123", "FT FATMT.2026A/5308"), que é o
    # mais fiável; depois "Fatura n.º 123"; num comprovativo, a referência.
    certified = re.search(
        r"\b((?:F[TRS]|N[CD]|RG|VD|GT|GR)\s?[A-Z0-9][A-Z0-9.\-]{0,20}/\d{1,10})\b", text)
    if certified:
        result.document_number = re.sub(r"\s+", " ", certified.group(1)).strip()
    else:
        num_match = re.search(
            r"(?:fatura|factura|invoice|recibo|documento|nota)\s*[^\n]{0,20}?\n?\s*"
            r"(?:n\.?\s*[ºo°]\.?|number|#)\s*[:\-]?\s*([A-Z]{0,4}\s?[\w/\-]*\d[\w/\-]*)",
            text, re.IGNORECASE)
        if num_match:
            candidate = num_match.group(1).strip()
            if any(ch.isdigit() for ch in candidate) and len(candidate) <= 32:
                result.document_number = candidate
    if not result.document_number and result.document_type == "receipt":
        ref = re.search(r"\b(?:refer[êe]ncia|ID|n\.?\s*[ºo°]\s*opera[çc][ãa]o)\s*[:\-]?\s*(\d{5,20})",
                        text, re.IGNORECASE)
        if ref:
            result.document_number = ref.group(1)

    # Datas: com o título na mesma linha, ou o valor por baixo do título.
    date_labels = [r"data\s*(?:de\s*)?(?:emiss[ãa]o|do\s*documento|da\s*fatura)",
                   r"data\s*(?:de\s*)?cria[çc][ãa]o", r"data\s*(?:do\s*)?movimento",
                   r"data\s*(?:da\s*)?opera[çc][ãa]o", r"data\s*valor",
                   r"data(?!\s*(?:limite|de\s*vencimento|de\s*pagamento))", r"date", r"emitid[oa]\s*em"]
    if result.document_type == "receipt":
        # Num comprovativo interessa o dia do pagamento, não o da impressão.
        date_labels = date_labels[1:] + date_labels[:1]
    result.document_date = _search_date(text, date_labels)
    if not result.document_date:
        below = _below(text, r"\bdata\b(?!\s*limite)", _DATE_TOKEN)
        result.document_date = _parse_date(below) if below else None
    if not result.document_date:
        result.document_date = _first_date(text)

    due_labels = [r"vencimento", r"data\s*limite", r"due\s*date", r"pagamento\s*at[ée]",
                  r"pagar\s*at[ée]", r"validade"]
    result.due_date = _search_date(text, due_labels)
    if not result.due_date:
        for label in (r"vencimento", r"data\s*limite"):
            below = _below(text, label, _DATE_TOKEN)
            if below and _parse_date(below):
                result.due_date = _parse_date(below)
                break

    if re.search(r"\bUSD\b|\$", text):
        result.currency = "USD"
    elif re.search(r"\bGBP\b|£", text):
        result.currency = "GBP"

    # --- Amounts ---
    # O total a pagar primeiro; "Custo total 0,00" (comissão do banco) e
    # "Total Motivo Isenção" (títulos) não são o total do documento.
    result.gross_amount = _last_amount(text, [
        rf"\btotal\s*(?:a\s*pagar|geral|do\s*documento|da\s*fatura|c/\s*iva|com\s*iva|due|due\s*now)\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
        rf"(?<!custo\s)\btotal(?:\s+(?:in|em)\b)?\s*{_CURRENCY}\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
        rf"\b(?:montante|import[âa]ncia|valor\s*(?:a\s*pagar|total|pago))\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
        rf"amount\s*due\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
        rf"(?:€|EUR)\s*{_AMOUNT}\s*(?:\btotal)",
    ])
    result.net_amount = _search_amount(text, [
        rf"\b(?:total\s*)?(?:il[ií]quido|base\s*tribut[áa]vel|sub-?total|valor\s*sem\s*iva|net(?:\s*amount)?|mercadoria/servi[çc]os)(?:\s+(?:in|em)\b)?\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
        rf"incid[êe]ncia\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
    ])
    result.vat_amount = _last_amount(text, [
        rf"(?:^|\n)\s*(?:total\s*(?:de\s*)?)?(?:iva|v\.?a\.?t\.?|imposto)\s*(?:\(?\s*\d{{1,2}}(?:[.,]\d+)?\s*%\s*\)?)?\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}\s*(?:€|EUR)?\s*$",
        rf"\b(?:total\s*(?:de\s*)?)?(?:iva|v\.?a\.?t\.?|imposto)\b\s*(?:\(?\s*\d{{1,2}}(?:[.,]\d+)?\s*%\s*\)?)?\s*[:\-]?\s*{_CURRENCY}\s*{_AMOUNT}",
    ])
    if result.document_type == "receipt" and result.vat_amount is None:
        # Um comprovativo de pagamento não discrimina IVA: o que saiu foi o total.
        result.vat_amount = Decimal("0.00") if result.gross_amount is not None else None

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
    # Só com o total e a taxa e nada mais: com base e IVA lidos do documento,
    # recalcular a partir de uma taxa apagava-os — e numa fatura com 6% e 23%
    # a "taxa" encontrada é só uma delas.
    elif r.gross_amount is not None and r.vat_rate and r.net_amount is None and r.vat_amount is None:
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
