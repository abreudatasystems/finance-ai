"""Invoice lines — the detail that makes mixed VAT rates possible.

A Portuguese invoice regularly carries 6%, 13% and 23% on the same paper. With
one rate on the header, the only honest way to book it was to split it into
several transactions, and the apuramento never quite matched the document.

The rules here:

* a line owns its own base, rate and VAT, and ``base + IVA = total`` holds for
  every single one of them;
* the header totals are the **sum of the lines**, never typed alongside them —
  a document with lines cannot disagree with itself;
* ``vat_rate`` on the header becomes the single rate when there is only one,
  and ``None`` when the document is mixed, which is what tells the rest of the
  system to read the lines instead;
* lines are optional. A transaction without them behaves exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Transaction, TransactionLine

CENTS = Decimal("0.01")
QTY = Decimal("0.001")


def _d(value, exp: Decimal = CENTS) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(exp, rounding=ROUND_HALF_UP)


def compute_line(quantity=None, unit_price=None, net_amount=None,
                 vat_rate=None, vat_amount=None) -> dict:
    """Work out one line's base, VAT and total, whichever way it was given.

    Two ways in: quantity × unit price, or a base typed directly. The VAT is
    the rate applied to the base unless an explicit amount is given — some
    suppliers round their own way, and the document wins over our arithmetic.
    """
    if net_amount is not None:
        net = _d(net_amount)
    elif quantity is not None and unit_price is not None:
        net = _d(Decimal(str(quantity)) * Decimal(str(unit_price)))
    else:
        raise HTTPException(
            status_code=400,
            detail="Cada linha precisa de quantidade e preço unitário, ou do valor sem IVA.",
        )

    if vat_amount is not None:
        vat = _d(vat_amount)
    elif vat_rate:
        vat = _d(net * Decimal(str(vat_rate)) / Decimal("100"))
    else:
        vat = Decimal("0.00")

    return {"net": net, "vat": vat, "gross": (net + vat).quantize(CENTS, rounding=ROUND_HALF_UP)}


def serialize(line: TransactionLine) -> dict:
    return {
        "id": line.id,
        "transaction_id": line.transaction_id,
        "line_number": line.line_number,
        "description": line.description,
        "quantity": float(line.quantity) if line.quantity is not None else None,
        "unit_price": float(line.unit_price) if line.unit_price is not None else None,
        "net_amount": float(_d(line.net_amount)),
        "vat_rate": line.vat_rate,
        "vat_amount": float(_d(line.vat_amount)),
        "gross_amount": float(_d(line.gross_amount)),
        "vat_exemption_reason": line.vat_exemption_reason,
        "category_id": line.category_id,
        "category_name": line.category_name,
    }


def list_lines(db: Session, company_id: str, transaction_id: str) -> list[TransactionLine]:
    return (
        db.query(TransactionLine)
        .filter(TransactionLine.company_id == company_id,
                TransactionLine.transaction_id == transaction_id)
        .order_by(TransactionLine.line_number)
        .all()
    )


def totals_of(lines: Iterable[TransactionLine]) -> dict:
    """The header figures, derived from the lines and nothing else."""
    net = vat = gross = Decimal("0.00")
    rates: set = set()
    for line in lines:
        net += _d(line.net_amount)
        vat += _d(line.vat_amount)
        gross += _d(line.gross_amount)
        rates.add(line.vat_rate if line.vat_rate is not None else 0.0)

    mixed = len(rates) > 1
    return {
        "net_amount": net,
        "vat_amount": vat,
        "gross_amount": gross,
        # A single rate is carried on the header as before; None means mixed,
        # which is what tells the rest of the system to read the lines.
        "vat_rate": None if mixed else (rates.pop() if rates else None),
        "mixed": mixed,
    }


def breakdown_by_rate(lines: Iterable[TransactionLine]) -> list[dict]:
    """Per-rate totals inside one document — what the VAT return needs."""
    buckets: dict = {}
    for line in lines:
        rate = line.vat_rate if line.vat_rate is not None else 0.0
        bucket = buckets.setdefault(rate, {"vat_rate": rate, "base": Decimal("0.00"),
                                           "iva": Decimal("0.00"), "total": Decimal("0.00"), "linhas": 0})
        bucket["base"] += _d(line.net_amount)
        bucket["iva"] += _d(line.vat_amount)
        bucket["total"] += _d(line.gross_amount)
        bucket["linhas"] += 1
    return [
        {"vat_rate": b["vat_rate"], "base_tributavel": float(b["base"]),
         "iva": float(b["iva"]), "total": float(b["total"]), "linhas": b["linhas"]}
        for b in sorted(buckets.values(), key=lambda x: -(x["vat_rate"] or 0))
    ]


def apply_totals(db: Session, trx: Transaction) -> dict:
    """Push the lines' sums onto the header, so the two can never disagree."""
    lines = list_lines(db, trx.company_id, trx.id)
    if not lines:
        return {"lines": 0}

    totals = totals_of(lines)
    trx.net_amount = totals["net_amount"]
    trx.vat_amount = totals["vat_amount"]
    trx.gross_amount = totals["gross_amount"]
    trx.amount = totals["gross_amount"]
    trx.vat_rate = totals["vat_rate"]

    # The withholding rides on the base, and the base just changed: recompute
    # it before anything reads the payable, or a corrected total keeps
    # yesterday's retention and the obligation claims a figure that no longer
    # adds up.
    from app.services.retentions import apply_to
    apply_to(trx, trx.retention_code)

    # The settlement layer owns paid/outstanding; re-derive so a changed total
    # does not leave an obligation claiming the old figure.
    from app.api.v1.settlements import recompute_settlement
    recompute_settlement(db, trx)
    return {"lines": len(lines), **{k: float(v) if isinstance(v, Decimal) else v for k, v in totals.items()}}


def replace_lines(db: Session, company_id: str, trx: Transaction, payload: list) -> dict:
    """Replace a document's lines wholesale and re-derive its totals.

    Replace rather than patch: a document is a whole, and editing it line by
    line across requests is how headers and lines drift apart.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Indique pelo menos uma linha.")
    if len(payload) > 500:
        raise HTTPException(status_code=400, detail="Máximo de 500 linhas por documento.")

    for old in list_lines(db, company_id, trx.id):
        db.delete(old)
    db.flush()

    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    created = []
    for index, item in enumerate(payload, start=1):
        description = (item.description or "").strip()
        if not description:
            raise HTTPException(status_code=400, detail=f"A linha {index} precisa de uma descrição.")

        amounts = compute_line(
            quantity=item.quantity, unit_price=item.unit_price,
            net_amount=item.net_amount, vat_rate=item.vat_rate, vat_amount=item.vat_amount,
        )
        if amounts["net"] < 0 or amounts["gross"] < 0:
            raise HTTPException(status_code=400, detail=f"A linha {index} tem valores negativos.")
        line = TransactionLine(
            id=f"LIN-{stamp}-{index:03d}",
            company_id=company_id,
            transaction_id=trx.id,
            line_number=index,
            description=description,
            quantity=_d(item.quantity, QTY) if item.quantity is not None else None,
            unit_price=Decimal(str(item.unit_price)) if item.unit_price is not None else None,
            net_amount=amounts["net"],
            vat_rate=item.vat_rate,
            vat_amount=amounts["vat"],
            gross_amount=amounts["gross"],
            vat_exemption_reason=item.vat_exemption_reason,
            category_id=item.category_id,
            category_name=item.category_name,
        )
        db.add(line)
        created.append(line)

    db.flush()
    summary = apply_totals(db, trx)
    db.commit()
    return {
        "status": "success",
        "linhas": [serialize(l) for l in created],
        "totais": summary,
        "por_taxa": breakdown_by_rate(created),
    }


def clear_lines(db: Session, company_id: str, trx: Transaction) -> dict:
    """Drop the lines and leave the header as the single source again."""
    removed = 0
    for line in list_lines(db, company_id, trx.id):
        db.delete(line)
        removed += 1
    db.commit()
    return {"status": "success", "removidas": removed}


def transactions_with_lines(db: Session, company_id: str, ids: Optional[list] = None) -> set:
    """Which transactions carry lines — used to avoid double counting VAT."""
    query = db.query(TransactionLine.transaction_id).filter(TransactionLine.company_id == company_id)
    if ids is not None:
        query = query.filter(TransactionLine.transaction_id.in_(ids))
    return {row[0] for row in query.distinct().all()}
