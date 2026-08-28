from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.models import Transaction
from app.schemas.schemas import TransactionCreate, TransactionOut
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=List[TransactionOut])
def get_transactions(company_id: str = "COMP001", type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.company_id == company_id)
    if type:
        query = query.filter(Transaction.type == type)
    trxs = query.order_by(Transaction.date.desc()).all()
    return trxs

@router.post("/", response_model=TransactionOut)
def create_transaction(item: TransactionCreate, db: Session = Depends(get_db)):
    trx_id = f"TRX-{int(datetime.utcnow().timestamp())}"
    new_trx = Transaction(
        id=trx_id,
        company_id=item.company_id,
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        due_date=item.due_date or datetime.utcnow().strftime("%Y-%m-%d"),
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
        notes=item.notes
    )
    db.add(new_trx)
    db.commit()
    db.refresh(new_trx)
    return new_trx
