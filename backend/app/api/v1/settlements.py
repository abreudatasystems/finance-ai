"""Settlement: installments (parcelas) and payments (pagamentos/recebimentos).

A payment is the only way money is recorded as settled. The transaction's
``paid_amount``, ``outstanding_amount`` and ``payment_status`` are always
*derived* from its payments, never written by hand — so partial payments keep
their history and the totals can never drift from the movements behind them.
"""

from datetime import datetime, timezone, date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.db.session import get_db
from app.models.models import Installment, Payment, Transaction, User, AuditLog

router = APIRouter()

CENTS = Decimal("0.01")
MAX_INSTALLMENTS = 120


def _d(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _stamp() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _scoped_trx(db: Session, company_id: str, trx_id: str) -> Transaction:
    trx = (
        db.query(Transaction)
        .filter(Transaction.id == trx_id, Transaction.company_id == company_id)
        .first()
    )
    if not trx:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return trx


def direction_for(trx: Transaction) -> str:
    """expense → money out (pagamento); income → money in (recebimento)."""
    return "in" if trx.type == "income" else "out"


def _add_months(d: date, months: int) -> date:
    """Same day-of-month N months later, clamped to the month's length."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    # Step back from the 1st of the next month to get this month's last day.
    next_month_first = date(year + (month // 12), (month % 12) + 1, 1)
    last_day = (next_month_first - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


def _settleable(trx: Transaction) -> Decimal:
    """What can ever move through the bank for this document.

    The gross, less any withholding at source. A document of 184,50 EUR with
    37,50 EUR withheld is settled in full at 147,00 EUR: the remaining 37,50 EUR
    goes to the State, not to the supplier, so treating the gross as the target
    leaves every such document permanently "partially paid".
    """
    from app.services import retentions as retention_service
    return retention_service.payable_of(trx)


def recompute_settlement(db: Session, trx: Transaction) -> None:
    """Re-derive the transaction's settlement state from its payments."""
    payments = db.query(Payment).filter(Payment.transaction_id == trx.id).all()
    paid = sum((_d(p.amount) for p in payments), Decimal("0.00"))
    gross = _settleable(trx)
    outstanding = (gross - paid).quantize(CENTS, rounding=ROUND_HALF_UP)

    trx.paid_amount = paid
    trx.outstanding_amount = outstanding

    if trx.payment_status == "cancelled":
        pass
    elif paid <= Decimal("0.00"):
        overdue = bool(trx.due_date and trx.due_date < date.today().isoformat())
        trx.payment_status = "overdue" if overdue else "pending"
    elif outstanding > Decimal("0.00"):
        overdue = bool(trx.due_date and trx.due_date < date.today().isoformat())
        trx.payment_status = "overdue" if overdue else "partially_paid"
    else:
        trx.payment_status = "paid"
        latest = max((p.payment_date for p in payments), default=None)
        trx.payment_date = latest

    # Keep each installment's own state in step.
    for inst in db.query(Installment).filter(Installment.transaction_id == trx.id).all():
        inst_paid = sum(
            (_d(p.amount) for p in payments if p.installment_id == inst.id),
            Decimal("0.00"),
        )
        inst.paid_amount = inst_paid
        inst_amount = _d(inst.amount)
        if inst_paid <= Decimal("0.00"):
            inst.status = "overdue" if inst.due_date < date.today().isoformat() else "pending"
        elif inst_paid < inst_amount:
            inst.status = "overdue" if inst.due_date < date.today().isoformat() else "partially_paid"
        else:
            inst.status = "paid"


# ─────────────────────────── Installments ───────────────────────────

class InstallmentPlan(BaseModel):
    count: int                              # how many parcelas
    first_due_date: Optional[str] = None    # defaults to the transaction's due date
    interval_days: Optional[int] = None     # when set, spaces by days instead of months


def _serialize_installment(i: Installment) -> dict:
    amount = _d(i.amount)
    paid = _d(i.paid_amount)
    return {
        "id": i.id,
        "transaction_id": i.transaction_id,
        "number": i.number,
        "total_count": i.total_count,
        "label": f"{i.number}/{i.total_count}",
        "due_date": i.due_date,
        "amount": float(amount),
        "paid_amount": float(paid),
        "outstanding_amount": float((amount - paid).quantize(CENTS, rounding=ROUND_HALF_UP)),
        "status": i.status,
    }


def build_schedule(gross: Decimal, count: int, first_due: str,
                   interval_days: Optional[int] = None) -> List[dict]:
    """Split a total into `count` parts that always add back up to it.

    Every part is the rounded-down share; the last one absorbs the remainder so
    the schedule can never drift by a cent from the invoice total.
    """
    base = (gross / Decimal(count)).quantize(CENTS, rounding=ROUND_HALF_UP)
    start = date.fromisoformat(first_due)
    rows = []
    running = Decimal("0.00")
    for n in range(1, count + 1):
        amount = base if n < count else (gross - running).quantize(CENTS, rounding=ROUND_HALF_UP)
        running += amount
        due = (start + timedelta(days=interval_days * (n - 1))) if interval_days else _add_months(start, n - 1)
        rows.append({"number": n, "due_date": due.isoformat(), "amount": amount})
    return rows


@router.get("/{trx_id}/installments")
def list_installments(
    trx_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    _scoped_trx(db, company_id, trx_id)
    rows = (
        db.query(Installment)
        .filter(Installment.transaction_id == trx_id, Installment.company_id == company_id)
        .order_by(Installment.number)
        .all()
    )
    return [_serialize_installment(i) for i in rows]


@router.post("/{trx_id}/installments", status_code=201)
def create_installments(
    trx_id: str,
    plan: InstallmentPlan,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Split a transaction into N parcelas. Replaces any unpaid existing plan."""
    trx = _scoped_trx(db, company_id, trx_id)

    if plan.count < 1 or plan.count > MAX_INSTALLMENTS:
        raise HTTPException(status_code=400, detail=f"O número de parcelas tem de estar entre 1 e {MAX_INSTALLMENTS}")

    existing = db.query(Installment).filter(Installment.transaction_id == trx_id).all()
    if any(_d(i.paid_amount) > 0 for i in existing):
        raise HTTPException(
            status_code=409,
            detail="Já existem parcelas pagas — não é possível refazer o plano.",
        )
    for i in existing:
        db.delete(i)

    # Parcelas split what is payable. Splitting the gross would produce a plan
    # that can never be settled, because the withheld part never moves.
    gross = _settleable(trx)
    if gross <= 0:
        raise HTTPException(status_code=400, detail="O lançamento não tem valor para parcelar")

    first_due = plan.first_due_date or trx.due_date or trx.date
    stamp = _stamp()
    created = []
    for row in build_schedule(gross, plan.count, first_due, plan.interval_days):
        inst = Installment(
            id=f"INS-{stamp}-{row['number']:03d}",
            company_id=company_id,
            transaction_id=trx_id,
            number=row["number"],
            total_count=plan.count,
            due_date=row["due_date"],
            amount=row["amount"],
            paid_amount=Decimal("0.00"),
            status="pending",
        )
        db.add(inst)
        created.append(inst)

    # The transaction's own due date follows the first instalment.
    trx.due_date = created[0].due_date
    db.flush()
    recompute_settlement(db, trx)
    db.commit()
    return [_serialize_installment(i) for i in created]


@router.get("/{trx_id}/installments/preview")
def preview_installments(
    trx_id: str,
    count: int,
    first_due_date: Optional[str] = None,
    interval_days: Optional[int] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Show the schedule that `count` parcelas would produce, without saving."""
    trx = _scoped_trx(db, company_id, trx_id)
    if count < 1 or count > MAX_INSTALLMENTS:
        raise HTTPException(status_code=400, detail=f"O número de parcelas tem de estar entre 1 e {MAX_INSTALLMENTS}")
    gross = _settleable(trx)
    first_due = first_due_date or trx.due_date or trx.date
    rows = build_schedule(gross, count, first_due, interval_days)
    return [
        {"number": r["number"], "label": f"{r['number']}/{count}",
         "due_date": r["due_date"], "amount": float(r["amount"])}
        for r in rows
    ]


# ───────────────────────────── Payments ─────────────────────────────

class PaymentCreate(BaseModel):
    amount: Optional[float] = None          # defaults to whatever is outstanding
    payment_date: Optional[str] = None      # defaults to today
    installment_id: Optional[str] = None    # settle one parcela
    bank_account_id: Optional[str] = None
    payment_method: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


def _serialize_payment(p: Payment) -> dict:
    return {
        "id": p.id,
        "transaction_id": p.transaction_id,
        "installment_id": p.installment_id,
        "bank_account_id": p.bank_account_id,
        "direction": p.direction,
        "kind": "recebimento" if p.direction == "in" else "pagamento",
        "amount": float(_d(p.amount)),
        "payment_date": p.payment_date,
        "payment_method": p.payment_method,
        "reference": p.reference,
        "notes": p.notes,
        "created_by": p.created_by,
    }


@router.get("/{trx_id}/payments")
def list_payments(
    trx_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    _scoped_trx(db, company_id, trx_id)
    rows = (
        db.query(Payment)
        .filter(Payment.transaction_id == trx_id, Payment.company_id == company_id)
        .order_by(Payment.payment_date, Payment.created_at)
        .all()
    )
    return [_serialize_payment(p) for p in rows]


@router.post("/{trx_id}/payments", status_code=201)
def create_payment(
    trx_id: str,
    item: PaymentCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Register a payment (expense) or a receipt (income), full or partial."""
    trx = _scoped_trx(db, company_id, trx_id)

    # What is settled is what is payable: the withholding never reaches the
    # supplier's bank account.
    gross = _settleable(trx)
    already = _d(trx.paid_amount)
    outstanding = (gross - already).quantize(CENTS, rounding=ROUND_HALF_UP)

    if outstanding <= 0:
        raise HTTPException(status_code=409, detail="Este lançamento já está totalmente liquidado")

    installment = None
    if item.installment_id:
        installment = (
            db.query(Installment)
            .filter(
                Installment.id == item.installment_id,
                Installment.transaction_id == trx_id,
                Installment.company_id == company_id,
            )
            .first()
        )
        if not installment:
            raise HTTPException(status_code=404, detail="Parcela não encontrada")
        inst_outstanding = (_d(installment.amount) - _d(installment.paid_amount)).quantize(CENTS, rounding=ROUND_HALF_UP)
        if inst_outstanding <= 0:
            raise HTTPException(status_code=409, detail=f"A parcela {installment.number} já está paga")

    # Default to settling whatever is open — the whole thing, or that parcela.
    if item.amount is None:
        amount = inst_outstanding if installment else outstanding
    else:
        amount = _d(item.amount)

    if amount <= 0:
        raise HTTPException(status_code=400, detail="O valor tem de ser positivo")
    if amount > outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"O valor excede o que está em aberto ({outstanding}). Registe no máximo esse montante.",
        )
    if installment and amount > inst_outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"O valor excede o que falta nesta parcela ({inst_outstanding}).",
        )

    now = datetime.now(timezone.utc)
    payment = Payment(
        id=f"PAY-{_stamp()}",
        company_id=company_id,
        transaction_id=trx_id,
        installment_id=installment.id if installment else None,
        bank_account_id=item.bank_account_id,
        direction=direction_for(trx),
        amount=amount,
        payment_date=item.payment_date or now.strftime("%Y-%m-%d"),
        payment_method=item.payment_method,
        reference=item.reference,
        notes=item.notes,
        created_by=current_user.name,
    )
    db.add(payment)
    db.flush()

    recompute_settlement(db, trx)

    kind = "Recebimento" if payment.direction == "in" else "Pagamento"
    db.add(AuditLog(
        id=f"AUD-PAY-{_stamp()}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=current_user.name,
        action=f"{kind} registado",
        module="Liquidação",
        description=(
            f"{kind} de {amount} em {payment.payment_date} para {trx.entity_name}"
            + (f" (parcela {installment.number}/{installment.total_count})" if installment else "")
            + f" — em aberto: {trx.outstanding_amount}"
        ),
        entity_id=trx_id,
    ))

    db.commit()
    db.refresh(payment)
    db.refresh(trx)
    return {
        "payment": _serialize_payment(payment),
        "transaction": {
            "id": trx.id,
            "paid_amount": float(_d(trx.paid_amount)),
            "outstanding_amount": float(_d(trx.outstanding_amount)),
            "payment_status": trx.payment_status,
        },
    }


@router.delete("/{trx_id}/payments/{payment_id}")
def delete_payment(
    trx_id: str,
    payment_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Undo a payment (e.g. registered by mistake) and re-derive the totals."""
    trx = _scoped_trx(db, company_id, trx_id)
    payment = (
        db.query(Payment)
        .filter(Payment.id == payment_id, Payment.transaction_id == trx_id,
                Payment.company_id == company_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    amount = _d(payment.amount)
    db.delete(payment)
    db.flush()
    recompute_settlement(db, trx)

    now = datetime.now(timezone.utc)
    db.add(AuditLog(
        id=f"AUD-PAYDEL-{_stamp()}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=current_user.name,
        action="Liquidação anulada",
        module="Liquidação",
        description=f"Anulou movimento de {amount} em {trx.entity_name} — em aberto: {trx.outstanding_amount}",
        entity_id=trx_id,
    ))
    db.commit()
    return {"status": "success", "deleted_id": payment_id,
            "payment_status": trx.payment_status,
            "outstanding_amount": float(_d(trx.outstanding_amount))}
