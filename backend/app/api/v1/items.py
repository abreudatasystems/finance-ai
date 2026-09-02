import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.models import Item, UserMembership
from app.schemas.schemas import ItemCreate, ItemUpdate, ItemOut
from app.api.deps import get_current_user

router = APIRouter()

def get_current_company_id(
    x_company_id: str = Header(None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
) -> str:
    # Use header if provided (like other routers), otherwise fallback
    if x_company_id:
        return x_company_id
    membership = db.query(UserMembership).filter(UserMembership.user_id == user_id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="User does not belong to any company.")
    return membership.company_id

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
    company_id: str = Depends(get_current_company_id)
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
    company_id: str = Depends(get_current_company_id)
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
    company_id: str = Depends(get_current_company_id)
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
