"""Suppliers — a view over the unified entity register.

Suppliers and customers are the same thing wearing different hats, so they
live in one table now (see app/services/entities.py). This endpoint keeps its
old shape — including ``total_spent`` — so existing clients carry on working,
but the numbers are derived from the movements rather than stored.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import SupplierCreate
from app.services import entities as service
from app.api.v1.entities import query_entities

router = APIRouter()


def _as_supplier(row: dict) -> dict:
    """The legacy supplier shape, filled from the entity and its balance."""
    compras = row.get("compras") or {}
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "name": row["name"],
        "nif": row["nif"],
        "email": row["email"],
        "phone": row["phone"],
        "address": row["address"],
        "default_category_id": row["default_category_id"],
        "default_category_name": row["default_category_name"],
        "total_spent": compras.get("faturado", 0.0),
        "em_divida": compras.get("em_divida", 0.0),
        "last_transaction_date": row.get("ultimo_movimento"),
        # New, and useful: the same company may also be a customer.
        "is_customer": row["is_customer"],
        "papel": row["papel"],
    }


@router.get("/")
def get_suppliers(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    rows = service.with_balances(db, company_id, query_entities(db, company_id, "supplier"))
    return [_as_supplier(r) for r in rows]


@router.post("/", status_code=201)
def create_supplier(
    item: SupplierCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    entity = service.create(db, company_id, {**item.model_dump(), "is_supplier": True})
    return _as_supplier(service.serialize(entity, {"compras": {}, "vendas": {}}))


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Drops the supplier role; the entity itself survives if it is also a customer."""
    entity = service.scoped(db, company_id, supplier_id)
    if entity.is_customer:
        entity.is_supplier = False
        db.commit()
        return {
            "status": "success",
            "deleted_id": supplier_id,
            "message": f"'{entity.name}' continua como cliente.",
        }
    return service.remove(db, company_id, supplier_id)
