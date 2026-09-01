from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Category, CategoryGroup
from app.api.v1.category_groups import ensure_system_groups
from app.schemas.schemas import CategoryCreate

router = APIRouter()


def _serialize(c: Category) -> dict:
    return {
        "id": c.id,
        "company_id": c.company_id,
        "type": c.type,
        "group_id": c.group_id,
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
    ensure_system_groups(db, company_id)
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
    ensure_system_groups(db, company_id)

    name = (item.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome é obrigatório")

    parent = None
    if item.parent_id:
        parent = (
            db.query(Category)
            .filter(Category.id == item.parent_id, Category.company_id == company_id)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Categoria-mãe não encontrada")
        if parent.parent_id:
            raise HTTPException(
                status_code=400,
                detail="A hierarquia vai só até à subcategoria — escolha uma categoria de topo.",
            )

    # A subcategory always inherits its parent's group and nature.
    group_id = parent.group_id if parent else item.group_id
    cat_type = parent.type if parent else item.type

    if group_id:
        group = (
            db.query(CategoryGroup)
            .filter(CategoryGroup.id == group_id, CategoryGroup.company_id == company_id)
            .first()
        )
        if not group:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        cat_type = group.kind          # the group decides the financial nature

    if cat_type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Indique um grupo ou o tipo (income/expense)")

    cat_id = f"CAT-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    new_cat = Category(
        id=cat_id,
        company_id=company_id,
        type=cat_type,
        group_id=group_id,
        name=name,
        parent_id=item.parent_id,
        description=item.description,
        keywords=",".join(item.keywords) if item.keywords else None,
        active=True,
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return _serialize(new_cat)


@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    cat = db.query(Category).filter(Category.id == category_id, Category.company_id == company_id).first()
    if not cat:
        return {"status": "error", "message": "Categoria não encontrada"}
    # Also delete child categories if any
    db.query(Category).filter(Category.parent_id == category_id, Category.company_id == company_id).delete()
    db.delete(cat)
    db.commit()
    return {"status": "success", "deleted_id": category_id}

