from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id, require_write
from app.models.models import Customer, User
from app.schemas.schemas import CustomerCreate

router = APIRouter()


@router.get("/")
def get_customers(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return db.query(Customer).filter(Customer.company_id == company_id).all()


@router.post("/", status_code=201)
def create_customer(
    item: CustomerCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    cust_id = f"CUST-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    new_cust = Customer(
        id=cust_id,
        company_id=company_id,
        name=item.name,
        nif=item.nif or "PT500000000",
        email=item.email,
        phone=item.phone,
        default_category_id=item.default_category_id,
        default_category_name=item.default_category_name,
        total_revenue=0.0,
    )
    db.add(new_cust)
    db.commit()
    db.refresh(new_cust)
    return new_cust


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    cust = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == company_id).first()
    if not cust:
        return {"status": "error", "message": "Cliente não encontrado"}
    db.delete(cust)
    db.commit()
    return {"status": "success", "deleted_id": customer_id}

