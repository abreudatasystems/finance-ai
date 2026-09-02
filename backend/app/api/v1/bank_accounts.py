"""Company bank accounts — where payments and receipts move money."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import BankAccount, Payment, User

router = APIRouter()


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    opening_balance: Optional[float] = None
    is_default: Optional[bool] = None
    active: Optional[bool] = None


class AccountCreate(BaseModel):
    name: str
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    currency: Optional[str] = "EUR"
    opening_balance: Optional[float] = 0
    is_default: Optional[bool] = False


def ensure_default_account(db: Session, company_id: str) -> None:
    """Give a company one account to book payments against, if it has none."""
    exists = db.query(BankAccount).filter(BankAccount.company_id == company_id).first()
    if exists:
        return
    db.add(BankAccount(
        id=f"BANK-{company_id}-1",
        company_id=company_id,
        name="Conta Principal",
        currency="EUR",
        opening_balance=Decimal("0.00"),
        is_default=True,
        active=True,
    ))
    db.commit()


def _serialize(a: BankAccount, balance: Optional[Decimal] = None) -> dict:
    return {
        "id": a.id,
        "company_id": a.company_id,
        "name": a.name,
        "bank_name": a.bank_name,
        "iban": a.iban,
        "currency": a.currency,
        "opening_balance": float(a.opening_balance or 0),
        "current_balance": float(balance) if balance is not None else None,
        "is_default": bool(a.is_default),
        "active": a.active,
    }


@router.get("/")
def list_accounts(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    ensure_default_account(db, company_id)
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.company_id == company_id)
        .order_by(BankAccount.is_default.desc(), BankAccount.name)
        .all()
    )
    payments = db.query(Payment).filter(Payment.company_id == company_id).all()
    out = []
    for a in accounts:
        balance = Decimal(str(a.opening_balance or 0))
        for p in payments:
            if p.bank_account_id != a.id:
                continue
            amount = Decimal(str(p.amount or 0))
            balance += amount if p.direction == "in" else -amount
        out.append(_serialize(a, balance))
    return out


@router.post("/", status_code=201)
def create_account(
    item: AccountCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    name = (item.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome da conta é obrigatório")

    if item.is_default:
        (db.query(BankAccount)
           .filter(BankAccount.company_id == company_id)
           .update({BankAccount.is_default: False}, synchronize_session=False))

    account = BankAccount(
        id=f"BANK-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        company_id=company_id,
        name=name,
        bank_name=item.bank_name,
        iban=item.iban,
        currency=item.currency or "EUR",
        opening_balance=Decimal(str(item.opening_balance or 0)),
        is_default=bool(item.is_default),
        active=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _serialize(account, Decimal(str(account.opening_balance or 0)))


@router.patch("/{account_id}")
def update_account(
    account_id: str,
    patch: AccountUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Correct an account — above all, the opening balance.

    Every company starts with one account created for it at a balance of zero,
    and until someone can say what is really there the cash position and the
    whole forecast are fiction. Creating a second account to work around a
    missing edit was the only way to fix that, and it left the wrong one behind.
    """
    account = (
        db.query(BankAccount)
        .filter(BankAccount.id == account_id, BankAccount.company_id == company_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    data = patch.model_dump(exclude_unset=True)

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome da conta é obrigatório")
        data["name"] = name

    if "opening_balance" in data:
        data["opening_balance"] = Decimal(str(data["opening_balance"] or 0))

    # Only one account can be the default one.
    if data.get("is_default"):
        (db.query(BankAccount)
           .filter(BankAccount.company_id == company_id, BankAccount.id != account_id)
           .update({BankAccount.is_default: False}, synchronize_session=False))

    for field, value in data.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)

    movements = db.query(Payment).filter(
        Payment.company_id == company_id, Payment.bank_account_id == account_id,
    ).all()
    balance = Decimal(str(account.opening_balance or 0))
    for movement in movements:
        amount = Decimal(str(movement.amount or 0))
        balance += amount if movement.direction == "in" else -amount
    return _serialize(account, balance)
