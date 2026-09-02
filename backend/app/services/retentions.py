"""Retenção na fonte — computing it, and what it does to the money.

Three things this has to get right, and each one is a way the product was
wrong before:

**The base.** Retention is computed on the amount without VAT. 150 € + 23% is a
document of 184,50 €; the withholding is 25% of 150 €, not of 184,50 €. Using
the gross inflates it by the VAT rate — 46,13 € instead of 37,50 €.

**The direction.** On an expense the company withholds: it pays 147,00 € and
owes 37,50 € to the State. On an income the client withholds: the company
receives less than it invoiced and holds a credit against its own income tax.
A model that only knows the expense side leaves every receivable overstated.

**The deadline.** What is withheld in a month is delivered to the State by the
20th of the month after. It is a real outflow on a real date, and a cash
forecast that ignores it is telling a small company it has money it has
already spent.

Nothing here decides anybody's tax position. Rates come from the catalog as
defaults a company can override per document, and the reports name the article
so an accountant can check the figure rather than trust it.
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.catalog import retentions as catalog
from app.models.models import Entity, Transaction

CENTS = Decimal("0.01")

#: Documents that never carry a withholding obligation.
EXCLUDED_STATUSES = ("cancelled", "draft")

#: Retenções de um mês entregam-se até ao dia 20 do mês seguinte.
DELIVERY_DAY = 20


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# The calculation
# ---------------------------------------------------------------------------

def resolve_rate(code: Optional[str], override: Optional[float] = None) -> Decimal:
    """The percentage to apply: what was asked for, else the catalog's default.

    An explicit rate always wins, including an explicit zero — a company told
    its supplier is exempt this year must be able to say so without the
    catalog quietly putting 25% back.
    """
    if override is not None:
        return _d(override)
    entry = catalog.get(code)
    return _d(entry.rate) if entry else Decimal("0.00")


def compute(base, code: Optional[str] = None,
            rate_override: Optional[float] = None) -> Decimal:
    """The amount withheld, on the base — never on the gross."""
    rate = resolve_rate(code, rate_override)
    if rate <= 0:
        return Decimal("0.00")
    return (_d(base) * rate / Decimal("100")).quantize(CENTS, rounding=ROUND_HALF_UP)


def apply_to(trx: Transaction, code: Optional[str] = None,
             rate_override: Optional[float] = None) -> Transaction:
    """Set the withholding on a document and the amount that really moves.

    ``payable_amount`` is the figure the bank will show: the gross less what
    is held back. Everything that settles, forecasts or reconciles reads that,
    not the gross, which is why it is written here once rather than derived in
    five places that would eventually disagree.
    """
    gross = _d(trx.gross_amount if trx.gross_amount is not None else trx.amount)
    base = _d(trx.net_amount) if trx.net_amount is not None else gross

    if code is not None:
        trx.retention_code = code or None
    effective_code = trx.retention_code

    rate = resolve_rate(effective_code, rate_override)
    withheld = compute(base, effective_code, rate_override)

    # A withholding can never exceed what is being paid; if it would, the
    # document's amounts are wrong and silently paying a negative is worse.
    if withheld > gross:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A retenção ({float(withheld):,.2f} €) é superior ao total do "
                f"documento ({float(gross):,.2f} €). Verifique a base e a taxa."
            ),
        )

    trx.retention_rate = float(rate) if rate else None
    trx.retention_amount = withheld
    trx.payable_amount = (gross - withheld).quantize(CENTS, rounding=ROUND_HALF_UP)
    return trx


def payable_of(trx: Transaction) -> Decimal:
    """What moves through the bank for this document.

    Falls back to the gross for documents booked before withholdings existed,
    so an old row reads as "nothing withheld" rather than as zero payable.
    """
    if trx.payable_amount is not None:
        return _d(trx.payable_amount)
    gross = _d(trx.gross_amount if trx.gross_amount is not None else trx.amount)
    return (gross - _d(trx.retention_amount)).quantize(CENTS, rounding=ROUND_HALF_UP)


def default_code_for(db: Session, company_id: str,
                     entity_id: Optional[str],
                     entity_name: Optional[str] = None) -> Optional[str]:
    """The withholding this counterparty usually carries, if it is known.

    A counterparty's retention is a property of the counterparty: the
    accountant is always 25%, the software vendor never. Matched by id, and
    by name when the document was typed before the entity existed.
    """
    query = db.query(Entity).filter(Entity.company_id == company_id)
    entity = None
    if entity_id:
        entity = query.filter(Entity.id == entity_id).first()
    if entity is None and entity_name:
        entity = query.filter(Entity.name.ilike(entity_name.strip())).first()
    return entity.default_retention_code if entity else None


# ---------------------------------------------------------------------------
# The period position: what is owed, and by when
# ---------------------------------------------------------------------------

def parse_period(period: str) -> tuple[str, str]:
    """AAAA-MM → the [start, end) of that month."""
    try:
        year, month = period.split("-")
        start = date(int(year), int(month), 1)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail=f"Período inválido: '{period}'. Use AAAA-MM, por exemplo 2026-09.",
        )
    last = calendar.monthrange(start.year, start.month)[1]
    end = date(start.year, start.month, last)
    return start.isoformat(), date(end.year, end.month, last).isoformat()


def delivery_date(period: str) -> str:
    """The 20th of the month after the one withheld in."""
    year, month = (int(p) for p in period.split("-"))
    year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return date(year, month, DELIVERY_DAY).isoformat()


def current_period(today: Optional[date] = None) -> str:
    today = today or date.today()
    return f"{today.year:04d}-{today.month:02d}"


def _documents(db: Session, company_id: str, start: str, end: str,
               side: Optional[str] = None) -> list[Transaction]:
    """Documents of the period that carry a withholding.

    Dated by the document, like the VAT and the income statement: the
    obligation arises with the document, not with the payment.
    """
    query = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.status.notin_(EXCLUDED_STATUSES),
            Transaction.retention_amount.isnot(None),
            Transaction.retention_amount > 0,
        )
    )
    if side:
        query = query.filter(Transaction.type == side)
    return query.order_by(Transaction.date).all()


def _row(trx: Transaction) -> dict:
    entry = catalog.get(trx.retention_code)
    gross = _d(trx.gross_amount if trx.gross_amount is not None else trx.amount)
    return {
        "id": trx.id,
        "data": trx.date,
        "documento": trx.document_number,
        "descricao": trx.description,
        "entity_id": trx.entity_id,
        "entidade": trx.entity_name,
        "tipo": trx.type,
        "base": float(_d(trx.net_amount) if trx.net_amount is not None else gross),
        "total": float(gross),
        "codigo": trx.retention_code,
        "retencao_label": entry.label if entry else trx.retention_code,
        "base_legal": entry.basis if entry else None,
        "taxa": trx.retention_rate,
        "retido": float(_d(trx.retention_amount)),
        "a_pagar": float(payable_of(trx)),
    }


def _by_code(rows: Iterable[dict]) -> list[dict]:
    """Grouped the way the delivery is declared: one line per rate."""
    groups: dict = {}
    for row in rows:
        key = (row["codigo"], row["taxa"])
        entry = groups.setdefault(key, {
            "codigo": row["codigo"],
            "label": row["retencao_label"],
            "base_legal": row["base_legal"],
            "taxa": row["taxa"],
            "base": Decimal("0.00"),
            "retido": Decimal("0.00"),
            "documentos": 0,
        })
        entry["base"] += _d(row["base"])
        entry["retido"] += _d(row["retido"])
        entry["documentos"] += 1
    return sorted(
        ({**g, "base": float(g["base"]), "retido": float(g["retido"])} for g in groups.values()),
        key=lambda g: -g["retido"],
    )


def position(db: Session, company_id: str, period: Optional[str] = None,
             today: Optional[date] = None) -> dict:
    """What was withheld in a month, what is owed, and by when.

    The two sides are kept apart on purpose. What the company withheld from
    its suppliers is a **debt** with a deadline. What clients withheld from the
    company is a **credit** against its own income tax, recoverable at the
    annual assessment and never offsettable against the first. Netting them
    would produce a number that is true of nothing.
    """
    today = today or date.today()
    period = period or current_period(today)
    start, end = parse_period(period)

    withheld_rows = [_row(t) for t in _documents(db, company_id, start, end, "expense")]
    suffered_rows = [_row(t) for t in _documents(db, company_id, start, end, "income")]

    owed = sum((_d(r["retido"]) for r in withheld_rows), Decimal("0.00"))
    credit = sum((_d(r["retido"]) for r in suffered_rows), Decimal("0.00"))
    due_on = delivery_date(period)

    return {
        "periodo": {"key": period, "inicio": start, "fim": end},
        "retido_a_terceiros": {
            "total": float(owed),
            "documentos": len(withheld_rows),
            "por_taxa": _by_code(withheld_rows),
            "linhas": withheld_rows,
        },
        "retido_por_terceiros": {
            "total": float(credit),
            "documentos": len(suffered_rows),
            "por_taxa": _by_code(suffered_rows),
            "linhas": suffered_rows,
        },
        "entrega": {
            "valor": float(owed),
            "ate": due_on,
            "em_atraso": bool(owed > 0 and due_on < today.isoformat()),
            "dias": (date.fromisoformat(due_on) - today).days,
        },
        "base": {
            "incidencia": "a retenção incide sobre a base, sem IVA",
            "prazo": f"entrega até ao dia {DELIVERY_DAY} do mês seguinte",
            "nota_credito": (
                "O que os clientes retiveram é um crédito de imposto da empresa, "
                "recuperado no apuramento anual — não abate ao que há a entregar."
            ),
        },
        "mensagem": _message(owed, credit, due_on, today),
    }


def _message(owed: Decimal, credit: Decimal, due_on: str, today: date) -> str:
    if owed <= 0 and credit <= 0:
        return "Nenhum documento deste mês tem retenção na fonte."
    parts = []
    if owed > 0:
        if due_on < today.isoformat():
            parts.append(
                f"Há {float(owed):,.2f} € de retenções por entregar ao Estado e o "
                f"prazo era {due_on}."
            )
        else:
            parts.append(
                f"Há {float(owed):,.2f} € de retenções a entregar ao Estado até {due_on}."
            )
    if credit > 0:
        parts.append(
            f"Os clientes retiveram {float(credit):,.2f} € — é crédito de imposto "
            "da empresa, não entra nesta entrega."
        )
    return " ".join(parts)


def outstanding_deliveries(db: Session, company_id: str,
                           today: Optional[date] = None,
                           months: int = 12) -> list[dict]:
    """Every month still owing a delivery, oldest first.

    A forecast and an alert both need this, and a company that missed March
    still owes March: looking only at the month just closed is how an
    obligation goes quiet.
    """
    today = today or date.today()
    out = []
    year, month = today.year, today.month
    for _ in range(months):
        period = f"{year:04d}-{month:02d}"
        start, end = parse_period(period)
        rows = _documents(db, company_id, start, end, "expense")
        owed = sum((_d(t.retention_amount) for t in rows), Decimal("0.00"))
        if owed > 0:
            due_on = delivery_date(period)
            out.append({
                "periodo": period,
                "valor": float(owed),
                "ate": due_on,
                "em_atraso": due_on < today.isoformat(),
                "documentos": len(rows),
            })
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return sorted(out, key=lambda row: row["ate"])


# ---------------------------------------------------------------------------
# The annual view, per counterparty — what the declaration is built from
# ---------------------------------------------------------------------------

def by_entity(db: Session, company_id: str, year: int,
              side: str = "expense") -> dict:
    """A year of withholdings, per counterparty.

    This is the shape the annual declaration of withheld amounts is filled in
    from — one line per supplier, with the NIF, the total base and the total
    withheld. Producing the official file is the accountant's job; producing
    the numbers correctly is this product's.
    """
    if side not in ("expense", "income"):
        raise HTTPException(status_code=400, detail="Use 'expense' ou 'income'.")

    rows = [
        _row(t) for t in _documents(
            db, company_id, f"{year:04d}-01-01", f"{year:04d}-12-31", side,
        )
    ]

    nifs = {
        e.id: e.nif for e in db.query(Entity).filter(Entity.company_id == company_id).all()
    }

    grouped: dict = {}
    for row in rows:
        key = row["entity_id"] or (row["entidade"] or "").strip().lower() or "sem-entidade"
        entry = grouped.setdefault(key, {
            "entity_id": row["entity_id"],
            "entidade": row["entidade"] or "Sem entidade",
            "nif": nifs.get(row["entity_id"]),
            "base": Decimal("0.00"),
            "retido": Decimal("0.00"),
            "documentos": 0,
            "codigos": set(),
        })
        entry["base"] += _d(row["base"])
        entry["retido"] += _d(row["retido"])
        entry["documentos"] += 1
        if row["codigo"]:
            entry["codigos"].add(row["codigo"])

    entities = sorted(
        ({
            **entry,
            "base": float(entry["base"]),
            "retido": float(entry["retido"]),
            "codigos": sorted(entry["codigos"]),
        } for entry in grouped.values()),
        key=lambda row: -row["retido"],
    )

    total = sum((_d(e["retido"]) for e in entities), Decimal("0.00"))
    return {
        "ano": year,
        "tipo": side,
        "total": float(total),
        "entidades": entities,
        "nota": (
            "Base para a declaração anual de retenções. Confirme com o "
            "contabilista antes de submeter."
        ),
    }


def catalogue(side: Optional[str] = None) -> list[dict]:
    """The withholdings that can be picked, optionally for one side only."""
    entries = catalog.for_side(side) if side else catalog.PT_RETENTIONS
    return [catalog.serialize(entry) for entry in entries]
