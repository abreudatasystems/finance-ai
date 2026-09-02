"""Catálogo de artigos — produtos e serviços que uma linha de documento nomeia.

A empresa activa vem de ``app.api.deps``, como em todos os outros módulos: essa
dependência valida que quem pede pertence mesmo à empresa do cabeçalho. Uma
resolução própria aqui aceitava o X-Company-Id de qualquer utilizador
autenticado, o que dava acesso ao catálogo de qualquer empresa.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.models import Item, User
from app.schemas.schemas import ItemCreate, ItemUpdate, ItemOut
from app.api.deps import get_current_company_id, require_write
from app.catalog import vat_rates

router = APIRouter()

@router.get("/vat-rates")
def list_vat_rates(region: str = Query(vat_rates.DEFAULT_REGION)):
    """As taxas que um artigo pode ter, e a percentagem que cada nome vale hoje.

    O artigo guarda o nome e a linha guarda a percentagem; quem escreve o
    documento precisa de ver a percentagem antes de gravar. Servir a tabela
    daqui evita uma segunda cópia no cliente que fica para trás quando a lei
    muda.
    """
    return {"regiao": region, "taxas": vat_rates.options(region)}


@router.get("/", response_model=List[ItemOut])
def list_items(
    kind: str = Query(None, description="Filter by kind: product or service"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id)
):
    query = db.query(Item).filter(Item.company_id == company_id)
    if kind:
        query = query.filter(Item.kind == kind)
    return query.order_by(Item.created_at.desc()).all()

@router.post("/", response_model=ItemOut)
def create_item(
    item_in: ItemCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    item = Item(
        id=f"ITM_{uuid.uuid4().hex[:12].upper()}",
        company_id=company_id,
        **item_in.dict()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: str,
    item_in: ItemUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    item = db.query(Item).filter(
        Item.id == item_id,
        Item.company_id == company_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = item_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item

@router.delete("/{item_id}")
def delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    item = db.query(Item).filter(
        Item.id == item_id,
        Item.company_id == company_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"message": "Item deleted successfully"}
