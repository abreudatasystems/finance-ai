from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Category
from app.schemas.schemas import CategoryCreate

router = APIRouter()


def _serialize(c: Category) -> dict:
    return {
        "id": c.id,
        "company_id": c.company_id,
        "type": c.type,
        "name": c.name,
        "parent_id": c.parent_id,
        "description": c.description,
        "keywords": c.keywords.split(",") if c.keywords else [],
        "active": c.active,
    }


@router.get("/")
def get_categories(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    query = db.query(Category).filter(Category.company_id == company_id)
    if type:
        query = query.filter(Category.type == type)
    cats = query.all()

    # Format tree structure
    result = []
    for p in [c for c in cats if not c.parent_id]:
        node = _serialize(p)
        node["children"] = [_serialize(c) for c in cats if c.parent_id == p.id]
        result.append(node)
    return result


@router.post("/", status_code=201)
def create_category(
    item: CategoryCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    cat_id = f"CAT-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    new_cat = Category(
        id=cat_id,
        company_id=company_id,
        type=item.type,
        name=item.name,
        parent_id=item.parent_id,
        description=item.description,
        keywords=",".join(item.keywords) if item.keywords else None,
        active=True,
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return _serialize(new_cat)
