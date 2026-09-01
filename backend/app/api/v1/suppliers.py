from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id, require_write
from app.models.models import Supplier, User
from app.schemas.schemas import SupplierCreate

router = APIRouter()


@router.get("/")
def get_suppliers(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return db.query(Supplier).filter(Supplier.company_id == company_id).all()


@router.post("/", status_code=201)
def create_supplier(
    item: SupplierCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    sup_id = f"SUP-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    new_sup = Supplier(
        id=sup_id,
        company_id=company_id,
        name=item.name,
        nif=item.nif or "PT000000000",
        email=item.email,
        phone=item.phone,
        address=item.address,
        default_category_id=item.default_category_id,
        default_category_name=item.default_category_name,
        total_spent=0.0,
        last_transaction_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    db.add(new_sup)
    db.commit()
    db.refresh(new_sup)
    return new_sup


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.company_id == company_id).first()
    if not sup:
        return {"status": "error", "message": "Fornecedor não encontrado"}
    db.delete(sup)
    db.commit()
    return {"status": "success", "deleted_id": supplier_id}

