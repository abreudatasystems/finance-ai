"""Portuguese VAT settlement (apuramento do IVA).

The rule that drives everything here: VAT charged on sales is **not income** —
it is money held on behalf of the State. It is offset against the VAT paid on
purchases, and the difference is either delivered to the State or carried as a
credit:

    IVA liquidado (vendas)  −  IVA dedutível (compras)  =  IVA a entregar
                                                           (ou a recuperar)

Legal basis for the defaults: CIVA. Under the regime normal, declarations are
monthly for turnover ≥ €650k and quarterly below it. Under the article 53
exemption the company neither charges nor deducts VAT, so the position is
always zero.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Company, Transaction, TransactionLine

CENTS = Decimal("0.01")

RATE_LABELS = {
    23.0: "Taxa Normal (23%)",
    13.0: "Taxa Intermédia (13%)",
    6.0: "Taxa Reduzida (6%)",
    0.0: "Isento / 0%",
}

REGIME_LABELS = {
    "normal": "Regime Normal",
    "isencao_art53": "Isenção (art.º 53.º do CIVA)",
}

EXCLUDED_STATUSES = ["cancelled", "draft"]


def _d(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def rate_label(rate: Optional[float]) -> str:
    if rate is None:
        return "Sem IVA definido"
    return RATE_LABELS.get(float(rate), f"Taxa {rate:g}%")


# ───────────────────────── period handling ─────────────────────────

def resolve_period(periodicity: str, period: Optional[str], today: Optional[date] = None
                   ) -> Tuple[str, str, str, str]:
    """Return (label, key, start_date, end_date_exclusive) for the period.

    Accepts "2026-08" (month), "2026-T3" (quarter) or "2026" (year); when no
    period is given it uses the one currently open for this periodicity.

    A period that cannot be read is a bad request, not a crash: anything the
    client can type reaches this function.
    """
    today = today or date.today()

    try:
        if period and len(period) >= 6 and period[5:6].upper() == "T":   # 2026-T3
            year = int(period[:4])
            quarter = int(period.upper().split("T")[1])
            if not 1 <= quarter <= 4:
                raise ValueError("trimestre fora de 1-4")
            start_month = 3 * (quarter - 1) + 1
            start = date(year, start_month, 1)
            end = date(year + (1 if start_month + 3 > 12 else 0),
                       ((start_month + 2) % 12) + 1, 1)
            return f"{quarter}.º Trimestre de {year}", f"{year}-T{quarter}", start.isoformat(), end.isoformat()

        if period and len(period) == 7 and period[4] == "-":   # 2026-08
            year, month = int(period[:4]), int(period[5:7])
            start = date(year, month, 1)
            end = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
            return f"{start.strftime('%m/%Y')}", f"{year}-{month:02d}", start.isoformat(), end.isoformat()

        if period and len(period) == 4:                        # 2026
            year = int(period)
            return f"Ano {year}", str(year), date(year, 1, 1).isoformat(), date(year + 1, 1, 1).isoformat()
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=400,
            detail=f"Período '{period}' não é válido. Use 2026-08 (mês), 2026-T3 (trimestre) ou 2026 (ano).",
        )

    if period:
        raise HTTPException(
            status_code=400,
            detail=f"Período '{period}' não é válido. Use 2026-08 (mês), 2026-T3 (trimestre) ou 2026 (ano).",
        )

    # No period given: the one currently open.
    if periodicity == "monthly":
        start = today.replace(day=1)
        end = date(start.year + (1 if start.month == 12 else 0),
                   1 if start.month == 12 else start.month + 1, 1)
        return start.strftime("%m/%Y"), f"{start.year}-{start.month:02d}", start.isoformat(), end.isoformat()

    quarter = (today.month - 1) // 3 + 1
    start_month = 3 * (quarter - 1) + 1
    start = date(today.year, start_month, 1)
    end_month = start_month + 3
    end = date(today.year + (1 if end_month > 12 else 0), end_month if end_month <= 12 else 1, 1)
    return (f"{quarter}.º Trimestre de {today.year}", f"{today.year}-T{quarter}",
            start.isoformat(), end.isoformat())


def statutory_deadlines(periodicity: str, end_exclusive: str) -> Dict[str, str]:
    """Declaration and payment deadlines under the CIVA.

    Periodic return: by the 20th of the 2nd month following the period.
    Payment: by the 25th of that same month.
    """
    end = date.fromisoformat(end_exclusive)
    # end is the first day after the period; the 2nd month following it
    month_index = end.month - 1 + 1          # one month after the period closes
    year = end.year + month_index // 12
    month = month_index % 12 + 1
    return {
        "declaracao_ate": date(year, month, 20).isoformat(),
        "pagamento_ate": date(year, month, 25).isoformat(),
    }


# ───────────────────────── the settlement ─────────────────────────

class _Row:
    """A per-rate aggregate, whether it came from headers or from lines."""

    __slots__ = ("vat_rate", "base", "iva", "bruto", "docs")

    def __init__(self, vat_rate, base, iva, bruto, docs):
        self.vat_rate = vat_rate
        self.base = base
        self.iva = iva
        self.bruto = bruto
        self.docs = docs


def _rows_by_rate(db: Session, company_id: str, start: str, end: str, tx_type: str):
    """Per-rate totals for the period.

    A document with lines is counted **from its lines** — that is the whole
    point of having them, since one invoice can carry 6%, 13% and 23%. A
    document without lines is counted from its header, exactly as before. The
    two never overlap, so nothing is counted twice.
    """
    period_filter = (
        Transaction.company_id == company_id,
        Transaction.type == tx_type,
        Transaction.date >= start,
        Transaction.date < end,
        Transaction.status.notin_(EXCLUDED_STATUSES),
    )

    with_lines = {
        row[0]
        for row in db.query(TransactionLine.transaction_id)
        .join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .filter(*period_filter)
        .distinct()
        .all()
    }

    header_query = db.query(
        Transaction.vat_rate,
        func.coalesce(func.sum(Transaction.net_amount), 0).label("base"),
        func.coalesce(func.sum(Transaction.vat_amount), 0).label("iva"),
        func.coalesce(func.sum(Transaction.amount), 0).label("bruto"),
        func.count(Transaction.id).label("docs"),
    ).filter(*period_filter)
    if with_lines:
        header_query = header_query.filter(Transaction.id.notin_(with_lines))

    buckets: dict = {}

    def _add(rate, base, iva, bruto, docs):
        key = rate if rate is not None else 0.0
        bucket = buckets.setdefault(key, _Row(key, Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), 0))
        bucket.base += _d(base)
        bucket.iva += _d(iva)
        bucket.bruto += _d(bruto)
        bucket.docs += docs

    for r in header_query.group_by(Transaction.vat_rate).all():
        _add(r.vat_rate, r.base, r.iva, r.bruto, r.docs)

    if with_lines:
        line_rows = (
            db.query(
                TransactionLine.vat_rate,
                func.coalesce(func.sum(TransactionLine.net_amount), 0).label("base"),
                func.coalesce(func.sum(TransactionLine.vat_amount), 0).label("iva"),
                func.coalesce(func.sum(TransactionLine.gross_amount), 0).label("bruto"),
                func.count(func.distinct(TransactionLine.transaction_id)).label("docs"),
            )
            .join(Transaction, Transaction.id == TransactionLine.transaction_id)
            .filter(*period_filter)
            .group_by(TransactionLine.vat_rate)
            .all()
        )
        for r in line_rows:
            _add(r.vat_rate, r.base, r.iva, r.bruto, r.docs)

    return sorted(buckets.values(), key=lambda r: -(r.vat_rate or 0))


def _summarise(rows) -> Tuple[List[dict], Decimal, Decimal, Decimal, int]:
    breakdown, base_t, iva_t, bruto_t, docs_t = [], Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), 0
    for r in rows:
        base, iva, bruto = _d(r.base), _d(r.iva), _d(r.bruto)
        base_t += base; iva_t += iva; bruto_t += bruto; docs_t += r.docs
        breakdown.append({
            "vat_rate": r.vat_rate,
            "label": rate_label(r.vat_rate),
            "base_tributavel": float(base),
            "iva": float(iva),
            "total": float(bruto),
            "num_documentos": r.docs,
        })
    return breakdown, base_t, iva_t, bruto_t, docs_t


def compute_vat_position(db: Session, company_id: str, period: Optional[str] = None,
                         today: Optional[date] = None) -> dict:
    """Full apuramento for the period: what is owed to (or owed by) the State."""
    company = db.query(Company).filter(Company.id == company_id).first()
    regime = (company.vat_regime if company else "normal") or "normal"
    periodicity = (company.vat_periodicity if company else "quarterly") or "quarterly"

    label, key, start, end = resolve_period(periodicity, period, today)

    # Sales → IVA liquidado (owed to the State). Purchases → IVA dedutível.
    out_rows = _rows_by_rate(db, company_id, start, end, "income")
    in_rows = _rows_by_rate(db, company_id, start, end, "expense")

    out_breakdown, out_base, iva_liquidado, out_gross, out_docs = _summarise(out_rows)
    in_breakdown, in_base, iva_dedutivel, in_gross, in_docs = _summarise(in_rows)

    exempt = regime == "isencao_art53"
    if exempt:
        # Under article 53 the company neither charges nor deducts VAT.
        iva_liquidado = Decimal("0.00")
        iva_dedutivel = Decimal("0.00")

    saldo = (iva_liquidado - iva_dedutivel).quantize(CENTS, rounding=ROUND_HALF_UP)
    a_entregar = saldo if saldo > 0 else Decimal("0.00")
    a_recuperar = -saldo if saldo < 0 else Decimal("0.00")

    deadlines = statutory_deadlines(periodicity, end)

    return {
        "period": {
            "key": key,
            "label": label,
            "start": start,
            "end": (date.fromisoformat(end)).isoformat(),
            "periodicity": periodicity,
            "periodicity_label": "Mensal" if periodicity == "monthly" else "Trimestral",
        },
        "regime": {
            "code": regime,
            "label": REGIME_LABELS.get(regime, regime),
            "exempt": exempt,
            "legal_form": company.legal_form if company else None,
            "nif": company.nif if company else None,
        },
        "iva_liquidado": {
            "total": float(iva_liquidado),
            "base_tributavel": float(out_base),
            "num_documentos": out_docs,
            "breakdown": out_breakdown,
        },
        "iva_dedutivel": {
            "total": float(iva_dedutivel),
            "base_tributavel": float(in_base),
            "num_documentos": in_docs,
            "breakdown": in_breakdown,
        },
        "apuramento": {
            "saldo": float(saldo),
            "a_entregar": float(a_entregar),
            "a_recuperar": float(a_recuperar),
            "situacao": (
                "isento" if exempt
                else "a_entregar" if saldo > 0
                else "a_recuperar" if saldo < 0
                else "neutro"
            ),
        },
        "prazos": deadlines,
        "nota": (
            "Empresa isenta ao abrigo do art.º 53.º do CIVA: não liquida nem deduz IVA."
            if exempt else
            "IVA liquidado nas vendas menos IVA dedutível nas compras. "
            "Apuramento na data do documento (regime de exigibilidade geral)."
        ),
    }


def compute_real_cash(db: Session, company_id: str, today: Optional[date] = None) -> dict:
    """Cash position split into what is actually the company's and what is the State's.

    The VAT collected but not yet delivered is a liability sitting inside the
    bank balance — spending it is spending the State's money.
    """
    today = today or date.today()

    received = _d(
        db.query(func.coalesce(func.sum(Transaction.paid_amount), 0))
        .filter(Transaction.company_id == company_id, Transaction.type == "income",
                Transaction.status.notin_(EXCLUDED_STATUSES))
        .scalar()
    )
    spent = _d(
        db.query(func.coalesce(func.sum(Transaction.paid_amount), 0))
        .filter(Transaction.company_id == company_id, Transaction.type == "expense",
                Transaction.status.notin_(EXCLUDED_STATUSES))
        .scalar()
    )
    cash = (received - spent).quantize(CENTS, rounding=ROUND_HALF_UP)

    position = compute_vat_position(db, company_id, None, today)
    vat_due = _d(position["apuramento"]["a_entregar"])
    real = (cash - vat_due).quantize(CENTS, rounding=ROUND_HALF_UP)

    return {
        "saldo_caixa": float(cash),
        "recebido": float(received),
        "pago": float(spent),
        "iva_a_entregar": float(vat_due),
        "iva_a_recuperar": position["apuramento"]["a_recuperar"],
        "dinheiro_real": float(real),
        "periodo_iva": position["period"]["label"],
        "prazo_pagamento_iva": position["prazos"]["pagamento_ate"],
        "alerta": (
            "O saldo de caixa inclui IVA que pertence ao Estado — o valor realmente disponível é menor."
            if vat_due > 0 else None
        ),
    }
