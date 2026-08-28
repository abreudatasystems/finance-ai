from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Transaction
from app.schemas.schemas import TransactionCreate, TransactionOut

router = APIRouter()


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


@router.post("/", response_model=TransactionOut, status_code=201)
def create_transaction(
    item: TransactionCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    now = datetime.now(timezone.utc)
    trx_id = f"TRX-{int(now.timestamp() * 1000)}"
    today = now.strftime("%Y-%m-%d")
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
        amount=item.amount,
        vat_amount=item.vat_amount or 0.0,
        status="approved",
        source="manual",
        is_recurring=item.is_recurring or False,
        payment_method=item.payment_method or "Cartão Empresarial",
        notes=item.notes,
    )
    db.add(new_trx)
    db.commit()
    db.refresh(new_trx)
    return new_trx
