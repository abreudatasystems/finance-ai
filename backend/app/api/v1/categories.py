"""Categories — the middle and lower levels of the classification tree.

Two kinds of category live side by side:

* **do sistema** (``is_system``) — created from the standard chart template
  (``app/catalog``). They are read-only: the name, nature, group, hierarchy
  and existence are fixed, so reports and the AI classifier can rely on them.
* **próprias** — created by the company when the standard chart has no
  matching entry. Fully editable and deletable.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4

from app.db.session import get_db
from app.api.deps import get_current_company_id, require_write
from app.models.models import Category, CategoryGroup, User
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
        "is_system": bool(c.is_system),
        "source_key": c.source_key,
        "snc_code": c.snc_code,
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
    _writer: User = Depends(require_write),
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

    # Timestamp keeps ids sortable; the suffix keeps two same-millisecond creations apart.
    cat_id = f"CAT-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid4().hex[:4].upper()}"
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


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[list[str]] = None
    group_id: Optional[str] = None
    active: Optional[bool] = None


def _scoped(db: Session, company_id: str, category_id: str) -> Category:
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.company_id == company_id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return cat


def _refuse_if_system(cat: Category, verb: str) -> None:
    """System categories come from the standard chart and stay as they are."""
    if cat.is_system:
        raise HTTPException(
            status_code=403,
            detail=(
                f"'{cat.name}' é uma categoria do sistema e não pode ser {verb}. "
                "Crie uma categoria própria se precisar de outra classificação."
            ),
        )


@router.patch("/{category_id}")
def update_category(
    category_id: str,
    patch: CategoryUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    cat = _scoped(db, company_id, category_id)
    _refuse_if_system(cat, "alterada")

    data = patch.model_dump(exclude_unset=True)

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome é obrigatório")
        data["name"] = name

    if "keywords" in data:
        kws = data.pop("keywords")
        cat.keywords = ",".join(k.strip() for k in kws if k.strip()) if kws else None

    if "group_id" in data and data["group_id"]:
        if cat.parent_id:
            raise HTTPException(
                status_code=400,
                detail="Uma subcategoria pertence ao grupo da categoria-mãe.",
            )
        group = (
            db.query(CategoryGroup)
            .filter(CategoryGroup.id == data["group_id"], CategoryGroup.company_id == company_id)
            .first()
        )
        if not group:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        cat.type = group.kind          # the group decides the financial nature
        # Subcategories follow their parent.
        (db.query(Category)
           .filter(Category.company_id == company_id, Category.parent_id == cat.id)
           .update({Category.group_id: group.id, Category.type: group.kind},
                   synchronize_session=False))

    for field, value in data.items():
        setattr(cat, field, value)

    db.commit()
    db.refresh(cat)
    return _serialize(cat)


@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    cat = _scoped(db, company_id, category_id)
    _refuse_if_system(cat, "eliminada")

    children = (
        db.query(Category)
        .filter(Category.parent_id == category_id, Category.company_id == company_id)
        .all()
    )
    locked = [c.name for c in children if c.is_system]
    if locked:
        raise HTTPException(
            status_code=409,
            detail=f"Contém subcategorias do sistema ({', '.join(locked)}) que não podem ser eliminadas.",
        )
    for child in children:
        db.delete(child)
    db.delete(cat)
    db.commit()
    return {"status": "success", "deleted_id": category_id}
