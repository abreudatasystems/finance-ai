"""Bank statement parsers for CSV and OFX formats."""
import csv
import io
import re
from datetime import datetime
from typing import List, Optional


class BankEntry:
    """Normalised representation of a single bank statement line."""

    def __init__(self, date: str, description: str, amount: float,
                 entry_type: str, balance: Optional[float] = None):
        self.date = date
        self.description = description
        self.amount = amount
        self.type = entry_type  # "credit" or "debit"
        self.balance = balance


def _normalise_amount(raw: str) -> float:
    """Parse monetary amounts from various European/US formats."""
    raw = raw.strip().replace("\xa0", "")
    # Handle parentheses for negative: (1.234,56) → -1234.56
    negative = raw.startswith("(") and raw.endswith(")")
    raw = raw.strip("()")
    # Detect European format: 1.234,56
    if re.search(r"\d\.\d{3},", raw):
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    raw = re.sub(r"[^\d.\-]", "", raw)
    try:
        val = float(raw)
    except ValueError:
        val = 0.0
    return -val if negative else val


def _detect_date(raw: str) -> str:
    """Try common date formats and return YYYY-MM-DD."""
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d",
                "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw.strip()


def _guess_columns(header: List[str]):
    """Heuristically map column indices to date, description, debit, credit, amount, balance."""
    lower = [h.lower().strip() for h in header]
    mapping = {"date": None, "description": None, "debit": None,
               "credit": None, "amount": None, "balance": None}

    date_keywords = ["data", "date", "dt", "fecha", "datum"]
    desc_keywords = ["descri", "descrição", "description", "detail", "conceito",
                     "movimento", "referência", "narration", "particular"]
    debit_keywords = ["débito", "debito", "debit", "saída", "saida"]
    credit_keywords = ["crédito", "credito", "credit", "entrada"]
    amount_keywords = ["valor", "amount", "montante", "importância", "quantia"]
    balance_keywords = ["saldo", "balance", "disponível"]

    for idx, col in enumerate(lower):
        if mapping["date"] is None and any(k in col for k in date_keywords):
            mapping["date"] = idx
        elif mapping["description"] is None and any(k in col for k in desc_keywords):
            mapping["description"] = idx
        elif mapping["debit"] is None and any(k in col for k in debit_keywords):
            mapping["debit"] = idx
        elif mapping["credit"] is None and any(k in col for k in credit_keywords):
            mapping["credit"] = idx
        elif mapping["amount"] is None and any(k in col for k in amount_keywords):
            mapping["amount"] = idx
        elif mapping["balance"] is None and any(k in col for k in balance_keywords):
            mapping["balance"] = idx

    # Fallback: first col = date, second = description, third = amount
    if mapping["date"] is None:
        mapping["date"] = 0
    if mapping["description"] is None:
        mapping["description"] = 1 if len(header) > 1 else 0
    if mapping["amount"] is None and mapping["debit"] is None:
        for idx in range(len(header)):
            if idx not in (mapping["date"], mapping["description"], mapping.get("balance")):
                mapping["amount"] = idx
                break

    return mapping


def parse_csv(content: bytes, encoding: str = "utf-8") -> List[BankEntry]:
    """Parse a bank CSV file into a list of BankEntry objects."""
    text = content.decode(encoding, errors="replace")
    # Try common delimiters
    for delimiter in [";", ",", "\t"]:
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
        if rows and len(rows[0]) >= 3:
            break
    else:
        return []

    if not rows:
        return []

    header = rows[0]
    mapping = _guess_columns(header)
    entries: List[BankEntry] = []

    for row in rows[1:]:
        if not row or len(row) <= max(v for v in mapping.values() if v is not None):
            continue

        date_raw = row[mapping["date"]] if mapping["date"] is not None else ""
        desc = row[mapping["description"]] if mapping["description"] is not None else ""
        balance = None

        if mapping["balance"] is not None and mapping["balance"] < len(row):
            try:
                balance = _normalise_amount(row[mapping["balance"]])
            except Exception:
                pass

        if mapping["debit"] is not None and mapping["credit"] is not None:
            debit_val = _normalise_amount(row[mapping["debit"]]) if row[mapping["debit"]].strip() else 0
            credit_val = _normalise_amount(row[mapping["credit"]]) if row[mapping["credit"]].strip() else 0
            if credit_val > 0:
                entries.append(BankEntry(_detect_date(date_raw), desc, credit_val, "credit", balance))
            if debit_val != 0:
                entries.append(BankEntry(_detect_date(date_raw), desc, abs(debit_val), "debit", balance))
        elif mapping["amount"] is not None:
            raw_amount = row[mapping["amount"]]
            if raw_amount.strip():
                amount = _normalise_amount(raw_amount)
                entry_type = "credit" if amount > 0 else "debit"
                entries.append(BankEntry(_detect_date(date_raw), desc, abs(amount), entry_type, balance))

    return entries


def parse_ofx(content: bytes) -> List[BankEntry]:
    """Minimal OFX/QFX parser — handles the SGML variant used by most PT banks."""
    text = content.decode("latin-1", errors="replace")
    entries: List[BankEntry] = []

    # Extract <STMTTRN> blocks
    trn_blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL | re.IGNORECASE)
    if not trn_blocks:
        # Try SGML-style without closing tags
        trn_blocks = re.split(r"<STMTTRN>", text)[1:]

    for block in trn_blocks:
        def _tag(name: str) -> str:
            m = re.search(rf"<{name}>\s*(.+?)(?:\s*<|$)", block, re.IGNORECASE)
            return m.group(1).strip() if m else ""

        date_raw = _tag("DTPOSTED")[:8]  # YYYYMMDD
        try:
            date_str = datetime.strptime(date_raw, "%Y%m%d").strftime("%Y-%m-%d")
        except ValueError:
            date_str = date_raw

        amount_raw = _tag("TRNAMT")
        try:
            amount = float(amount_raw.replace(",", "."))
        except ValueError:
            amount = 0.0

        desc = _tag("MEMO") or _tag("NAME") or _tag("FITID")
        entry_type = "credit" if amount > 0 else "debit"
        entries.append(BankEntry(date_str, desc, abs(amount), entry_type))

    return entries


def detect_bank_name(file_name: str, content_sample: str = "") -> str:
    """Best-effort guess of the bank from file name or content."""
    combined = (file_name + " " + content_sample).lower()
    banks = {
        "millennium": "Millennium BCP",
        "bcp": "Millennium BCP",
        "santander": "Santander Totta",
        "cgd": "Caixa Geral de Depósitos",
        "caixa": "Caixa Geral de Depósitos",
        "novo banco": "Novo Banco",
        "novobanco": "Novo Banco",
        "bpi": "BPI",
        "montepio": "Montepio",
        "itaú": "Itaú",
        "itau": "Itaú",
        "bradesco": "Bradesco",
        "nubank": "Nubank",
        "revolut": "Revolut",
        "wise": "Wise",
        "n26": "N26",
    }
    for key, name in banks.items():
        if key in combined:
            return name
    return "Banco Desconhecido"
