"""Entities API — suppliers and customers as one register.

The old /suppliers and /customers endpoints still work: they are now views
over this same store, filtered by role.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import Entity, User
from app.services import entities as service

router = APIRouter()


class EntityIn(BaseModel):
    name: str
    nif: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_supplier: bool = False
    is_customer: bool = False
    default_category_id: Optional[str] = None
    default_category_name: Optional[str] = None
    notes: Optional[str] = None


class EntityPatch(BaseModel):
    name: Optional[str] = None
    nif: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_supplier: Optional[bool] = None
    is_customer: Optional[bool] = None
    default_category_id: Optional[str] = None
    default_category_name: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class MergeRequest(BaseModel):
    merge_id: str


def query_entities(db: Session, company_id: str, role: str = "all",
                   q: Optional[str] = None, include_inactive: bool = False):
    query = db.query(Entity).filter(Entity.company_id == company_id)
    if role == "supplier":
        query = query.filter(Entity.is_supplier.is_(True))
    elif role == "customer":
        query = query.filter(Entity.is_customer.is_(True))
    if not include_inactive:
        query = query.filter(Entity.active.isnot(False))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((Entity.name.ilike(like)) | (Entity.nif.ilike(like)))
    return query.order_by(Entity.name).all()


@router.get("/")
def list_entities(
    role: str = Query("all", description="all | supplier | customer"),
    q: Optional[str] = Query(None, description="procura por nome ou NIF"),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The register, each row with its balance derived from the movements."""
    rows = query_entities(db, company_id, role, q, include_inactive)
    return service.with_balances(db, company_id, rows)


@router.post("/", status_code=201)
def create_entity(
    body: EntityIn,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Create, or add the missing role to the entity that already exists."""
    entity = service.create(db, company_id, body.model_dump())
    return service.serialize(entity)


@router.get("/{entity_id}")
def get_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Conta-corrente: every document, settled and open."""
    return service.statement(db, company_id, entity_id)


@router.patch("/{entity_id}")
def update_entity(
    entity_id: str,
    patch: EntityPatch,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    entity = service.update(db, company_id, entity_id, patch.model_dump(exclude_unset=True))
    return service.serialize(entity)


@router.delete("/{entity_id}")
def delete_entity(
    entity_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Deletes only what has no history; anything with movements is archived."""
    return service.remove(db, company_id, entity_id)


@router.post("/{entity_id}/merge")
def merge_entities(
    entity_id: str,
    body: MergeRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Fold a duplicate into this entity, bringing its movements along."""
    return service.merge(db, company_id, entity_id, body.merge_id)
