from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from app.db.session import get_db
from app.api.deps import get_current_company_id, get_current_user
from app.models.models import Transaction, User
from app.schemas.schemas import TransactionCreate, TransactionUpdate, TransactionOut

router = APIRouter()

CENTS = Decimal("0.01")


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
):
    now = datetime.now(timezone.utc)
    trx_id = f"TRX-{int(now.timestamp() * 1000)}"
    today = now.strftime("%Y-%m-%d")

    # A zero default vat_amount must not shadow an explicit vat_rate.
    explicit_vat = _d(item.vat_amount) if item.vat_amount else None
    net, vat, gross = _derive_amounts(item.amount, item.vat_rate, explicit_vat, _d(item.net_amount))

    new_trx = Transaction(
        id=trx_id,
        company_id=company_id,
        date=today,
        due_date=item.due_date or today,
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
        paid_amount=gross if item.is_paid else Decimal("0.00"),
        outstanding_amount=Decimal("0.00") if item.is_paid else gross,
        payment_status="paid" if item.is_paid else "pending",
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
):
    trx = _scoped(db, company_id, trx_id)
    data = patch.model_dump(exclude_unset=True)

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
