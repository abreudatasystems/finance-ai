"""Accounting export — the file the accountant actually accepts.

What a Portuguese accountant asks for at the end of a period is not a
dashboard: it is the movements, with the SNC account, the VAT split by rate,
and whether each document was settled. This builds exactly that.

Two things make it useful rather than decorative:

* a document detailed **by lines** is exported line by line, each with its own
  rate and SNC account, so a mixed-VAT invoice does not have to be re-read by
  hand;
* every figure comes from the same place the apuramento uses, so the export
  and the VAT return can never tell different stories.

CSV is written for Portuguese Excel: semicolons, comma decimals, and a BOM so
the accents survive the double-click.
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import Category, Company, Entity, Transaction, TransactionLine
from app.services.vat_engine import compute_vat_position, resolve_period

CENTS = Decimal("0.01")
EXCLUDED_STATUSES = ("cancelled", "draft", "pending_approval", "pending_ai")

LEDGER_HEADERS = [
    "Data", "Vencimento", "Tipo", "Nº Documento", "Descrição", "Entidade", "NIF",
    "Categoria", "Conta SNC", "Base tributável", "Taxa IVA", "IVA", "Total",
    "Estado", "Pago", "Em aberto", "Data pagamento", "Origem", "ID",
]

VAT_HEADERS = ["Sentido", "Taxa", "Base tributável", "IVA", "Total", "Nº documentos"]

TYPE_LABEL = {"income": "Receita", "expense": "Despesa", "transfer": "Transferência"}
STATUS_LABEL = {
    "paid": "Liquidado", "partially_paid": "Parcialmente pago",
    "overdue": "Vencido", "pending": "Em aberto", "cancelled": "Anulado",
}


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _pt(value: Decimal) -> str:
    """1234.56 -> '1234,56'. Excel in Portugal expects the comma."""
    return f"{value:.2f}".replace(".", ",")


def _snc_map(db: Session, company_id: str) -> dict:
    """Category id -> SNC account, falling back to the parent's account."""
    categories = db.query(Category).filter(Category.company_id == company_id).all()
    by_id = {c.id: c for c in categories}
    out = {}
    for cat in categories:
        code = cat.snc_code
        parent = by_id.get(cat.parent_id) if cat.parent_id else None
        if not code and parent:
            code = parent.snc_code
        out[cat.id] = code or ""
    return out


def _nif_map(db: Session, company_id: str) -> dict:
    entities = db.query(Entity).filter(Entity.company_id == company_id).all()
    out = {}
    for e in entities:
        out[e.id] = e.nif or ""
        out[e.name] = e.nif or ""
    return out


def ledger_rows(db: Session, company_id: str, start: str, end: str) -> list[dict]:
    """One row per document — or per line, when the document has lines."""
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.status.notin_(EXCLUDED_STATUSES),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    if not transactions:
        return []

    ids = [t.id for t in transactions]
    lines_by_trx: dict = {}
    for line in (
        db.query(TransactionLine)
        .filter(TransactionLine.company_id == company_id,
                TransactionLine.transaction_id.in_(ids))
        .order_by(TransactionLine.line_number)
        .all()
    ):
        lines_by_trx.setdefault(line.transaction_id, []).append(line)

    snc = _snc_map(db, company_id)
    nifs = _nif_map(db, company_id)

    rows = []
    for trx in transactions:
        base = {
            "Data": trx.date,
            "Vencimento": trx.due_date or "",
            "Tipo": TYPE_LABEL.get(trx.type, trx.type),
            "Nº Documento": trx.document_number or "",
            "Entidade": trx.entity_name or "",
            "NIF": nifs.get(trx.entity_id) or nifs.get(trx.entity_name) or "",
            "Estado": STATUS_LABEL.get(trx.payment_status, trx.payment_status or ""),
            "Data pagamento": trx.payment_date or "",
            "Origem": trx.source or "",
            "ID": trx.id,
        }
        lines = lines_by_trx.get(trx.id)

        if lines:
            # Line by line: each rate lands on its own row, with its own account.
            for line in lines:
                category_id = line.category_id or trx.category_id
                rows.append({
                    **base,
                    "Descrição": f"{trx.description} · {line.description}",
                    "Categoria": line.category_name or trx.category_name or "",
                    "Conta SNC": snc.get(category_id, ""),
                    "Base tributável": _d(line.net_amount),
                    "Taxa IVA": line.vat_rate if line.vat_rate is not None else 0,
                    "IVA": _d(line.vat_amount),
                    "Total": _d(line.gross_amount),
                    # Settlement belongs to the document, not to one of its lines.
                    "Pago": Decimal("0.00"),
                    "Em aberto": Decimal("0.00"),
                })
            # One closing row carries the document's settlement, so the two are
            # never confused with each other.
            rows.append({
                **base,
                "Descrição": f"{trx.description} · (total do documento)",
                "Categoria": trx.category_name or "",
                "Conta SNC": snc.get(trx.category_id, ""),
                "Base tributável": _d(trx.net_amount),
                "Taxa IVA": "misto",
                "IVA": _d(trx.vat_amount),
                "Total": _d(trx.gross_amount if trx.gross_amount is not None else trx.amount),
                "Pago": _d(trx.paid_amount),
                "Em aberto": _d(trx.outstanding_amount),
            })
        else:
            rows.append({
                **base,
                "Descrição": trx.description,
                "Categoria": trx.category_name or "",
                "Conta SNC": snc.get(trx.category_id, ""),
                "Base tributável": _d(trx.net_amount if trx.net_amount is not None else trx.amount),
                "Taxa IVA": trx.vat_rate if trx.vat_rate is not None else 0,
                "IVA": _d(trx.vat_amount),
                "Total": _d(trx.gross_amount if trx.gross_amount is not None else trx.amount),
                "Pago": _d(trx.paid_amount),
                "Em aberto": _d(trx.outstanding_amount),
            })

    return rows


def vat_rows(position: dict) -> list[dict]:
    """The VAT return's own figures, per rate and side."""
    rows = []
    for side, label in (("iva_liquidado", "IVA liquidado (vendas)"),
                        ("iva_dedutivel", "IVA dedutível (compras)")):
        for line in position[side]["breakdown"]:
            rows.append({
                "Sentido": label,
                "Taxa": line["label"],
                "Base tributável": _d(line["base_tributavel"]),
                "IVA": _d(line["iva"]),
                "Total": _d(line["total"]),
                "Nº documentos": line["num_documentos"],
            })
    apuramento = position["apuramento"]
    rows.append({
        "Sentido": "Apuramento",
        "Taxa": "—",
        "Base tributável": Decimal("0.00"),
        "IVA": _d(apuramento["saldo"]),
        "Total": _d(apuramento["a_entregar"] or apuramento["a_recuperar"]),
        "Nº documentos": "",
    })
    return rows


def to_csv(rows: list[dict], headers: list[str]) -> str:
    """Semicolons, comma decimals and a BOM — what Excel in Portugal expects."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([
            _pt(row[h]) if isinstance(row.get(h), Decimal) else row.get(h, "")
            for h in headers
        ])
    return "﻿" + buffer.getvalue()


def totals(rows: list[dict]) -> dict:
    """Control figures, so the accountant can tie the file to the totals."""
    def _sum(key: str, tipo: Optional[str] = None) -> Decimal:
        return sum(
            (r[key] for r in rows
             if isinstance(r.get(key), Decimal)
             and (tipo is None or r["Tipo"] == tipo)
             and r.get("Taxa IVA") != "misto"),
            Decimal("0.00"),
        )

    return {
        "linhas": len(rows),
        "receita_base": float(_sum("Base tributável", "Receita")),
        "receita_iva": float(_sum("IVA", "Receita")),
        "receita_total": float(_sum("Total", "Receita")),
        "despesa_base": float(_sum("Base tributável", "Despesa")),
        "despesa_iva": float(_sum("IVA", "Despesa")),
        "despesa_total": float(_sum("Total", "Despesa")),
    }


def build(db: Session, company_id: str, period: Optional[str] = None) -> dict:
    """Everything the accountant needs for one period, in one call."""
    company = db.query(Company).filter(Company.id == company_id).first()
    periodicity = (company.vat_periodicity if company else "quarterly") or "quarterly"
    label, key, start, end = resolve_period(periodicity, period)

    rows = ledger_rows(db, company_id, start, end)
    position = compute_vat_position(db, company_id, period)

    return {
        "empresa": {
            "nome": company.name if company else "",
            "nif": company.nif if company else "",
            "regime_iva": company.vat_regime if company else "normal",
        },
        "periodo": {"label": label, "key": key, "inicio": start, "fim": end},
        "razao": rows,
        "iva": vat_rows(position),
        "apuramento": position["apuramento"],
        "prazos": position["prazos"],
        "totais": totals(rows),
    }


def filename(kind: str, company_name: str, period_key: str) -> str:
    slug = "".join(ch if ch.isalnum() else "-" for ch in (company_name or "empresa")).strip("-").lower()
    return f"{kind}-{slug}-{period_key}.csv"
