"""Customers — a view over the unified entity register (see suppliers.py)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import CustomerCreate
from app.services import entities as service
from app.api.v1.entities import query_entities

router = APIRouter()


def _as_customer(row: dict) -> dict:
    vendas = row.get("vendas") or {}
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "name": row["name"],
        "nif": row["nif"],
        "email": row["email"],
        "phone": row["phone"],
        "default_category_id": row["default_category_id"],
        "default_category_name": row["default_category_name"],
        "total_revenue": vendas.get("faturado", 0.0),
        "por_receber": vendas.get("por_receber", 0.0),
        "last_transaction_date": row.get("ultimo_movimento"),
        "is_supplier": row["is_supplier"],
        "papel": row["papel"],
    }


@router.get("/")
def get_customers(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    rows = service.with_balances(db, company_id, query_entities(db, company_id, "customer"))
    return [_as_customer(r) for r in rows]


@router.post("/", status_code=201)
def create_customer(
    item: CustomerCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    entity = service.create(db, company_id, {**item.model_dump(), "is_customer": True})
    return _as_customer(service.serialize(entity, {"compras": {}, "vendas": {}}))


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Drops the customer role; the entity survives if it is also a supplier."""
    entity = service.scoped(db, company_id, customer_id)
    if entity.is_supplier:
        entity.is_customer = False
        db.commit()
        return {
            "status": "success",
            "deleted_id": customer_id,
            "message": f"'{entity.name}' continua como fornecedor.",
        }
    return service.remove(db, company_id, customer_id)
