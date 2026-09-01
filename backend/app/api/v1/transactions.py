from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from app.db.session import get_db
from app.api.deps import get_current_company_id, get_current_user, require_write
from app.models.models import Transaction, User
from app.schemas.schemas import TransactionCreate, TransactionUpdate, TransactionOut
from app.api.v1.settlements import (
    InstallmentPlan, PaymentCreate, create_installments, create_payment, recompute_settlement,
)

router = APIRouter()

CENTS = Decimal("0.01")

#: The document's own lifecycle. Settlement state lives apart, derived from
#: the payments (see app/api/v1/settlements.py).
VALID_STATUSES = {
    "draft", "pending_ai", "pending_approval", "approved",
    "paid", "received", "cancelled",
}


def _valid_date(value: Optional[str]) -> Optional[str]:
    """Accept a date only if it really is one; anything else falls back to today."""
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Data inválida: '{value}'. Use AAAA-MM-DD.")


def _d(value) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _derive_amounts(gross: Decimal, vat_rate: Optional[float], vat_amount: Optional[Decimal],
                    net_amount: Optional[Decimal]):
    """Return a coherent (net, vat, gross) triple.

    Priority: explicit net → derive vat; explicit vat → derive net;
    vat_rate → split gross; otherwise assume no VAT (net == gross).
    """
    gross = _d(gross) or Decimal("0.00")
    if net_amount is not None:
        net = _d(net_amount)
        vat = (gross - net).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif vat_amount is not None:
        vat = _d(vat_amount)
        net = (gross - vat).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif vat_rate:
        rate = Decimal(str(vat_rate)) / Decimal("100")
        net = (gross / (Decimal("1") + rate)).quantize(CENTS, rounding=ROUND_HALF_UP)
        vat = (gross - net).quantize(CENTS, rounding=ROUND_HALF_UP)
    else:
        net = gross
        vat = Decimal("0.00")
    return net, vat, gross


def _scoped(db: Session, company_id: str, trx_id: str) -> Transaction:
    trx = (
        db.query(Transaction)
        .filter(Transaction.id == trx_id, Transaction.company_id == company_id)
        .first()
    )
    if not trx:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return trx


@router.get("/", response_model=List[TransactionOut])
def get_transactions(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    query = db.query(Transaction).filter(Transaction.company_id == company_id)
    if type:
        query = query.filter(Transaction.type == type)
    return query.order_by(Transaction.date.desc()).all()


@router.get("/{trx_id}", response_model=TransactionOut)
def get_transaction(
    trx_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return _scoped(db, company_id, trx_id)


@router.post("/", response_model=TransactionOut, status_code=201)
def create_transaction(
    item: TransactionCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    now = datetime.now(timezone.utc)
    trx_id = f"TRX-{int(now.timestamp() * 1000)}"
    today = now.strftime("%Y-%m-%d")

    # The date the document belongs to, not the day it was typed: an invoice
    # from August entered in September is an August document, and that is what
    # decides its VAT period.
    booking_date = _valid_date(item.date) or today

    # A zero default vat_amount must not shadow an explicit vat_rate.
    explicit_vat = _d(item.vat_amount) if item.vat_amount else None
    net, vat, gross = _derive_amounts(item.amount, item.vat_rate, explicit_vat, _d(item.net_amount))

    new_trx = Transaction(
        id=trx_id,
        company_id=company_id,
        date=booking_date,
        due_date=item.due_date or booking_date,
        type=item.type,
        description=item.description,
        entity_name=item.entity_name,
        entity_id=item.entity_id,
        category_id=item.category_id,
        category_name=item.category_name,
        cost_center_id=item.cost_center_id,
        cost_center_name=item.cost_center_name,
        amount=gross,
        net_amount=net,
        vat_rate=item.vat_rate,
        vat_amount=vat,
        gross_amount=gross,
        currency=item.currency or "EUR",
        paid_amount=Decimal("0.00"),
        outstanding_amount=gross,
        payment_status="pending",
        status="approved",
        source="manual",
        document_number=item.document_number,
        document_type=item.document_type,
        document_date=item.document_date,
        is_recurring=item.is_recurring or False,
        payment_method=item.payment_method or "Cartão Empresarial",
        notes=item.notes,
        tags=",".join(item.tags) if item.tags else None,
        created_by=current_user.name,
    )
    db.add(new_trx)
    db.flush()

    # Optional plan of parcelas requested at creation time.
    if item.installment_count and item.installment_count > 1:
        create_installments(
            trx_id,
            InstallmentPlan(count=item.installment_count, first_due_date=new_trx.due_date),
            db=db,
            company_id=company_id,
        )
        db.refresh(new_trx)

    # "Already paid" books a real payment rather than writing the totals by hand,
    # so the settlement state stays derived from actual movements.
    if item.is_paid:
        create_payment(
            trx_id,
            PaymentCreate(payment_date=today, payment_method=new_trx.payment_method),
            db=db,
            company_id=company_id,
            current_user=current_user,
        )
        db.refresh(new_trx)

    db.commit()
    db.refresh(new_trx)
    return new_trx


@router.patch("/{trx_id}", response_model=TransactionOut)
def update_transaction(
    trx_id: str,
    patch: TransactionUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    trx = _scoped(db, company_id, trx_id)
    data = patch.model_dump(exclude_unset=True)

    if "date" in data:
        data["date"] = _valid_date(data["date"]) or trx.date

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Use um de: {', '.join(sorted(VALID_STATUSES))}.",
            )
        if data["status"] == "cancelled":
            # A cancelled document owes nothing and is owed nothing.
            trx.payment_status = "cancelled"
        elif trx.payment_status == "cancelled":
            trx.payment_status = "paid" if _d(trx.paid_amount) >= _d(trx.gross_amount) else "pending"

    if "tags" in data:
        tags = data.pop("tags")
        trx.tags = ",".join(tags) if tags else None

    money_touched = any(k in data for k in ("amount", "net_amount", "vat_rate", "vat_amount"))

    for field, value in data.items():
        setattr(trx, field, value)

    # Recompute the net/vat/gross triple whenever any money field changed.
    if money_touched:
        gross = _d(trx.amount)
        net, vat, gross = _derive_amounts(gross, trx.vat_rate, _d(trx.vat_amount) if "vat_amount" in data else None,
                                          _d(trx.net_amount) if "net_amount" in data else None)
        trx.net_amount, trx.vat_amount, trx.amount, trx.gross_amount = net, vat, gross, gross

    # Keep outstanding coherent with paid amount.
    if trx.gross_amount is not None:
        paid = _d(trx.paid_amount) or Decimal("0.00")
        trx.outstanding_amount = (_d(trx.gross_amount) - paid).quantize(CENTS, rounding=ROUND_HALF_UP)

    db.commit()
    db.refresh(trx)
    return trx
