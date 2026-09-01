"""Reconciliation service — closing the loop between the books and the bank.

A bank line is the proof that money actually moved. Matching one is therefore
not a label on a transaction: it is a **payment**. So this module has a single
job, expressed in one link (``Payment.bank_entry_id``):

* matching an entry to a transaction settles that obligation — reusing an
  existing payment of the right amount when there is one, and otherwise
  creating the payment the bank line describes;
* the transaction's paid / outstanding / payment_status stay derived by the
  settlement layer, never written here;
* unmatching undoes exactly what the match did — a payment born from a bank
  line is removed, one that already existed is only unlinked.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import (
    BankStatement, BankStatementEntry, Payment, Transaction, User,
)

CENTS = Decimal("0.01")

#: How far apart a bank line and a transaction may be and still be a candidate.
DATE_WINDOW_DAYS = 7
#: Amounts must agree to the cent — a bank line is not an approximation.
AMOUNT_TOLERANCE = Decimal("0.01")
#: Below this a suggestion is not worth showing.
MIN_SCORE = 40


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _parse(day: Optional[str]) -> Optional[date]:
    try:
        return date.fromisoformat((day or "")[:10])
    except ValueError:
        return None


def _days_apart(a: Optional[str], b: Optional[str]) -> Optional[int]:
    da, db_ = _parse(a), _parse(b)
    if not da or not db_:
        return None
    return abs((da - db_).days)


def _word_overlap(a: str, b: str) -> float:
    """Share of words the two descriptions have in common (0-1)."""
    wa = {w for w in (a or "").lower().split() if len(w) > 2}
    wb = {w for w in (b or "").lower().split() if len(w) > 2}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / max(len(wa), len(wb))


# --------------------------------------------------------------------------
# Suggestions
# --------------------------------------------------------------------------

def _direction_of(entry: BankStatementEntry) -> str:
    """A debit is money leaving: it settles something we owe."""
    return "out" if entry.type == "debit" else "in"


def score(entry: BankStatementEntry, trx: Transaction) -> int:
    """How strongly this bank line looks like that transaction (0-100).

    The amount is the backbone — a line that does not match to the cent is not
    a candidate at all. Date proximity and the words in the description only
    decide the ordering among amounts that already agree.
    """
    outstanding = _d(trx.outstanding_amount if trx.outstanding_amount is not None
                     else (trx.gross_amount if trx.gross_amount is not None else trx.amount))
    amount = _d(entry.amount).copy_abs()
    if (outstanding - amount).copy_abs() > AMOUNT_TOLERANCE:
        return 0

    total = 60  # exact amount

    gap = _days_apart(entry.date, trx.payment_date or trx.due_date or trx.date)
    if gap is None:
        total += 5
    elif gap == 0:
        total += 25
    elif gap <= 3:
        total += 18
    elif gap <= DATE_WINDOW_DAYS:
        total += 10

    text = f"{trx.entity_name or ''} {trx.description or ''} {trx.document_number or ''}"
    overlap = _word_overlap(entry.description, text)
    total += int(round(overlap * 15))

    return min(total, 100)


def suggestions(db: Session, company_id: str, entry: BankStatementEntry, limit: int = 5) -> list[dict]:
    """Transactions this bank line could be settling, best first."""
    direction = _direction_of(entry)
    wanted_type = "expense" if direction == "out" else "income"

    candidates = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == wanted_type,
            Transaction.status != "cancelled",
            Transaction.payment_status.in_(["pending", "partially_paid", "overdue"]),
        )
        .all()
    )

    scored = []
    for trx in candidates:
        value = score(entry, trx)
        if value >= MIN_SCORE:
            scored.append({
                "transaction_id": trx.id,
                "description": trx.description,
                "entity_name": trx.entity_name,
                "category_name": trx.category_name,
                "document_number": trx.document_number,
                "date": trx.date,
                "due_date": trx.due_date,
                "amount": float(_d(trx.amount)),
                "outstanding": float(_d(trx.outstanding_amount if trx.outstanding_amount is not None else trx.amount)),
                "payment_status": trx.payment_status,
                "score": value,
                "porque": _why(entry, trx, value),
            })
    scored.sort(key=lambda s: s["score"], reverse=True)
    return scored[:limit]


def _why(entry: BankStatementEntry, trx: Transaction, value: int) -> str:
    """Say what made this a candidate — a score with no reason is not useful."""
    bits = ["valor igual ao cêntimo"]
    gap = _days_apart(entry.date, trx.payment_date or trx.due_date or trx.date)
    if gap == 0:
        bits.append("mesma data")
    elif gap is not None and gap <= DATE_WINDOW_DAYS:
        bits.append(f"{gap} dia(s) de diferença")
    if _word_overlap(entry.description, f"{trx.entity_name or ''} {trx.description or ''}") > 0:
        bits.append("descrição parecida")
    return " · ".join(bits)


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------

def scoped_entry(db: Session, company_id: str, entry_id: str) -> BankStatementEntry:
    entry = (
        db.query(BankStatementEntry)
        .filter(BankStatementEntry.id == entry_id, BankStatementEntry.company_id == company_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Movimento bancário não encontrado")
    return entry


def payment_of(db: Session, entry_id: str) -> Optional[Payment]:
    return db.query(Payment).filter(Payment.bank_entry_id == entry_id).first()


def match(db: Session, company_id: str, current_user: User, entry_id: str,
          transaction_id: Optional[str] = None, payment_id: Optional[str] = None) -> dict:
    """Reconcile one bank line, settling the obligation behind it."""
    from app.api.v1.settlements import recompute_settlement   # settlement stays the owner of the state

    entry = scoped_entry(db, company_id, entry_id)
    if payment_of(db, entry_id):
        raise HTTPException(status_code=409, detail="Este movimento já está conciliado")

    amount = _d(entry.amount).copy_abs()
    direction = _direction_of(entry)

    # --- 1. an existing payment the user picked -------------------------
    if payment_id:
        payment = (
            db.query(Payment)
            .filter(Payment.id == payment_id, Payment.company_id == company_id)
            .first()
        )
        if not payment:
            raise HTTPException(status_code=404, detail="Pagamento não encontrado")
        if payment.bank_entry_id:
            raise HTTPException(status_code=409, detail="Esse pagamento já está ligado a outro movimento")
        if (_d(payment.amount) - amount).copy_abs() > AMOUNT_TOLERANCE:
            raise HTTPException(
                status_code=409,
                detail=f"O pagamento é de {_d(payment.amount)} € e o movimento de {amount} €. Os valores têm de coincidir.",
            )
        trx = db.query(Transaction).filter(Transaction.id == payment.transaction_id).first()

    # --- 2. a transaction: reuse its payment, or create the one the bank shows
    elif transaction_id:
        trx = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id, Transaction.company_id == company_id)
            .first()
        )
        if not trx:
            raise HTTPException(status_code=404, detail="Lançamento não encontrado")
        if (trx.type == "expense") != (direction == "out"):
            raise HTTPException(
                status_code=409,
                detail="O sentido não bate certo: um débito bancário liquida uma despesa, um crédito uma receita.",
            )

        payment = (
            db.query(Payment)
            .filter(Payment.transaction_id == trx.id, Payment.bank_entry_id.is_(None))
            .all()
        )
        payment = next((p for p in payment if (_d(p.amount) - amount).copy_abs() <= AMOUNT_TOLERANCE), None)

        if payment is None:
            outstanding = _d(trx.outstanding_amount if trx.outstanding_amount is not None
                             else (trx.gross_amount if trx.gross_amount is not None else trx.amount))
            if amount > outstanding + AMOUNT_TOLERANCE:
                raise HTTPException(
                    status_code=409,
                    detail=f"O movimento ({amount} €) é maior do que o que está em aberto ({outstanding} €).",
                )
            now = datetime.now(timezone.utc)
            payment = Payment(
                id=f"PAY-BNK-{int(now.timestamp() * 1000)}",
                company_id=company_id,
                transaction_id=trx.id,
                direction=direction,
                amount=amount,
                payment_date=entry.date,
                payment_method="bank_transfer",
                reference=entry.description[:120] if entry.description else None,
                notes="Criado a partir do extrato bancário",
                source="bank",
                created_by=current_user.name,
            )
            db.add(payment)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="Indique o lançamento ou o pagamento a conciliar")

    payment.bank_entry_id = entry.id
    payment.reconciliation_status = "matched"

    entry.matched_transaction_id = payment.transaction_id
    entry.status = "matched"
    entry.match_confidence = 100
    entry.reconciled_at = datetime.now(timezone.utc)

    if trx:
        recompute_settlement(db, trx)
    _refresh_statement_counter(db, entry.statement_id)
    db.commit()

    return {
        "status": "success",
        "entry_id": entry.id,
        "payment_id": payment.id,
        "transaction_id": payment.transaction_id,
        "criou_pagamento": payment.source == "bank",
        "payment_status": trx.payment_status if trx else None,
        "outstanding_amount": float(_d(trx.outstanding_amount)) if trx else None,
    }


def unmatch(db: Session, company_id: str, entry_id: str) -> dict:
    """Undo a reconciliation, including the payment it created."""
    from app.api.v1.settlements import recompute_settlement

    entry = scoped_entry(db, company_id, entry_id)
    payment = payment_of(db, entry_id)

    trx = None
    removed = False
    if payment:
        trx = db.query(Transaction).filter(Transaction.id == payment.transaction_id).first()
        if payment.source == "bank":
            # It only ever existed because of this bank line.
            db.delete(payment)
            removed = True
        else:
            payment.bank_entry_id = None
            payment.reconciliation_status = "unmatched"

    entry.matched_transaction_id = None
    entry.status = "unmatched"
    entry.match_confidence = None
    entry.reconciled_at = None

    if trx:
        db.flush()
        recompute_settlement(db, trx)
    _refresh_statement_counter(db, entry.statement_id)
    db.commit()

    return {
        "status": "success",
        "entry_id": entry.id,
        "pagamento_removido": removed,
        "payment_status": trx.payment_status if trx else None,
    }


def ignore(db: Session, company_id: str, entry_id: str, ignored: bool = True) -> dict:
    """Park a line that has no counterpart in the books (bank fees, transfers)."""
    entry = scoped_entry(db, company_id, entry_id)
    if payment_of(db, entry_id):
        raise HTTPException(status_code=409, detail="Desfaça a conciliação antes de ignorar este movimento")
    entry.status = "ignored" if ignored else "unmatched"
    db.commit()
    return {"status": "success", "entry_id": entry.id, "entry_status": entry.status}


def _refresh_statement_counter(db: Session, statement_id: str) -> None:
    """Keep the statement's matched count derived from its entries."""
    statement = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
    if not statement:
        return
    entries = db.query(BankStatementEntry).filter(BankStatementEntry.statement_id == statement_id).all()
    statement.total_entries = len(entries)
    statement.matched_entries = len([e for e in entries if e.status == "matched"])


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------

def serialize_entry(entry: BankStatementEntry, payment: Optional[Payment] = None,
                    trx: Optional[Transaction] = None) -> dict:
    return {
        "id": entry.id,
        "statement_id": entry.statement_id,
        "date": entry.date,
        "description": entry.description,
        "amount": float(_d(entry.amount)),
        "type": entry.type,
        "balance": float(_d(entry.balance)) if entry.balance is not None else None,
        "status": entry.status,
        "match_confidence": entry.match_confidence,
        "reconciled_at": entry.reconciled_at.isoformat() if entry.reconciled_at else None,
        "payment_id": payment.id if payment else None,
        "payment_source": payment.source if payment else None,
        "transaction": {
            "id": trx.id,
            "description": trx.description,
            "entity_name": trx.entity_name,
            "category_name": trx.category_name,
            "amount": float(_d(trx.amount)),
            "date": trx.date,
            "payment_status": trx.payment_status,
        } if trx else None,
    }


def list_entries(db: Session, company_id: str, status: str = "all",
                 statement_id: Optional[str] = None) -> list[dict]:
    query = db.query(BankStatementEntry).filter(BankStatementEntry.company_id == company_id)
    if statement_id:
        query = query.filter(BankStatementEntry.statement_id == statement_id)
    if status and status != "all":
        query = query.filter(BankStatementEntry.status == status)
    entries = query.order_by(BankStatementEntry.date.desc()).all()
    if not entries:
        return []

    payments = {
        p.bank_entry_id: p
        for p in db.query(Payment)
        .filter(Payment.company_id == company_id,
                Payment.bank_entry_id.in_([e.id for e in entries]))
        .all()
    }
    trx_ids = [e.matched_transaction_id for e in entries if e.matched_transaction_id]
    transactions = {
        t.id: t
        for t in (db.query(Transaction).filter(Transaction.id.in_(trx_ids)).all() if trx_ids else [])
    }
    return [
        serialize_entry(e, payments.get(e.id), transactions.get(e.matched_transaction_id))
        for e in entries
    ]


def overview(db: Session, company_id: str) -> dict:
    """Where the reconciliation stands, in the terms a person cares about."""
    entries = db.query(BankStatementEntry).filter(BankStatementEntry.company_id == company_id).all()
    by_status: dict[str, int] = {}
    for e in entries:
        by_status[e.status] = by_status.get(e.status, 0) + 1

    open_entries = [e for e in entries if e.status in ("unmatched", "suggested")]
    payments_open = (
        db.query(Payment)
        .filter(Payment.company_id == company_id, Payment.bank_entry_id.is_(None))
        .all()
    )
    return {
        "movimentos": len(entries),
        "conciliados": by_status.get("matched", 0),
        "por_conciliar": len(open_entries),
        "ignorados": by_status.get("ignored", 0),
        "valor_por_conciliar": float(sum((_d(e.amount).copy_abs() for e in open_entries), Decimal("0.00"))),
        "pagamentos_sem_extrato": len(payments_open),
        "valor_pagamentos_sem_extrato": float(sum((_d(p.amount) for p in payments_open), Decimal("0.00"))),
        "percentagem": round(by_status.get("matched", 0) / len(entries) * 100) if entries else 0,
    }
