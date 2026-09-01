"""Category groups — the top level of the classification tree.

Every company gets two system groups, Receita and Despesa, created on demand.
They cannot be renamed, re-typed or deleted. Companies may add their own groups
(Investimento, Transferência …), but each must declare the financial nature it
behaves as (``kind``: income or expense) so the cash-flow, dashboard and fiscal
aggregations keep working unchanged.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id
from app.db.session import get_db
from app.models.models import Category, CategoryGroup

router = APIRouter()

VALID_KINDS = {"income", "expense"}

# The two groups every company starts with.
SYSTEM_GROUPS = [
    {"slug": "receita", "name": "Receita", "kind": "income",
     "icon": "💰", "color": "emerald", "sort_order": 0,
     "description": "Tudo o que entra: vendas, serviços e outros rendimentos."},
    {"slug": "despesa", "name": "Despesa", "kind": "expense",
     "icon": "💸", "color": "rose", "sort_order": 1,
     "description": "Tudo o que sai: fornecedores, operação e custos."},
]


class GroupCreate(BaseModel):
    name: str
    kind: str                      # income | expense — the nature it behaves as
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


def ensure_system_groups(db: Session, company_id: str) -> None:
    """Create the Receita/Despesa groups for this company if they are missing.

    Done lazily so companies that predate this feature get them on first read,
    without needing a data migration.
    """
    existing = {
        g.name.lower()
        for g in db.query(CategoryGroup)
        .filter(CategoryGroup.company_id == company_id, CategoryGroup.is_system.is_(True))
        .all()
    }
    created = False
    for spec in SYSTEM_GROUPS:
        if spec["slug"] in existing:
            continue
        db.add(CategoryGroup(
            id=f"GRP-{company_id}-{spec['slug'].upper()}",
            company_id=company_id,
            name=spec["name"],
            kind=spec["kind"],
            icon=spec["icon"],
            color=spec["color"],
            description=spec["description"],
            is_system=True,
            sort_order=spec["sort_order"],
            active=True,
        ))
        created = True
    if created:
        db.commit()
        # Attach pre-existing categories to their matching system group.
        for spec in SYSTEM_GROUPS:
            gid = f"GRP-{company_id}-{spec['slug'].upper()}"
            (db.query(Category)
               .filter(Category.company_id == company_id,
                       Category.group_id.is_(None),
                       Category.type == spec["kind"])
               .update({Category.group_id: gid}, synchronize_session=False))
        db.commit()


def _serialize(g: CategoryGroup, category_count: int = 0) -> dict:
    return {
        "id": g.id,
        "company_id": g.company_id,
        "name": g.name,
        "kind": g.kind,
        "icon": g.icon,
        "color": g.color,
        "description": g.description,
        "is_system": bool(g.is_system),
        "sort_order": g.sort_order or 0,
        "active": g.active,
        "category_count": category_count,
    }


def _scoped(db: Session, company_id: str, group_id: str) -> CategoryGroup:
    group = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.id == group_id, CategoryGroup.company_id == company_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return group


@router.get("/")
def list_groups(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    ensure_system_groups(db, company_id)
    groups = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.company_id == company_id)
        .order_by(CategoryGroup.sort_order, CategoryGroup.name)
        .all()
    )
    counts = {}
    for cat in db.query(Category).filter(Category.company_id == company_id).all():
        if cat.parent_id is None and cat.group_id:
            counts[cat.group_id] = counts.get(cat.group_id, 0) + 1
    return [_serialize(g, counts.get(g.id, 0)) for g in groups]


@router.post("/", status_code=201)
def create_group(
    item: GroupCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    ensure_system_groups(db, company_id)

    if item.kind not in VALID_KINDS:
        raise HTTPException(
            status_code=400,
            detail="A natureza do grupo tem de ser 'income' (receita) ou 'expense' (despesa)",
        )
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome do grupo é obrigatório")

    clash = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.company_id == company_id)
        .filter(CategoryGroup.name.ilike(name))
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail=f"Já existe um grupo chamado '{name}'")

    last = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.company_id == company_id)
        .order_by(CategoryGroup.sort_order.desc())
        .first()
    )
    group = CategoryGroup(
        id=f"GRP-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        company_id=company_id,
        name=name,
        kind=item.kind,
        icon=item.icon,
        color=item.color,
        description=item.description,
        is_system=False,
        sort_order=((last.sort_order or 0) + 1) if last else 0,
        active=True,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _serialize(group)


@router.patch("/{group_id}")
def update_group(
    group_id: str,
    patch: GroupUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    group = _scoped(db, company_id, group_id)
    data = patch.model_dump(exclude_unset=True)

    # System groups keep their identity: only presentation may change.
    if group.is_system:
        locked = {"name", "kind", "active"} & data.keys()
        if locked:
            raise HTTPException(
                status_code=403,
                detail=f"'{group.name}' é um grupo do sistema: {', '.join(sorted(locked))} não pode ser alterado",
            )

    if "kind" in data and data["kind"] not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Natureza inválida")

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome do grupo é obrigatório")
        clash = (
            db.query(CategoryGroup)
            .filter(CategoryGroup.company_id == company_id, CategoryGroup.id != group_id)
            .filter(CategoryGroup.name.ilike(name))
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail=f"Já existe um grupo chamado '{name}'")
        data["name"] = name

    for field, value in data.items():
        setattr(group, field, value)

    # Categories mirror their group's nature.
    if "kind" in data:
        (db.query(Category)
           .filter(Category.company_id == company_id, Category.group_id == group_id)
           .update({Category.type: data["kind"]}, synchronize_session=False))

    db.commit()
    db.refresh(group)
    return _serialize(group)


@router.delete("/{group_id}")
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    group = _scoped(db, company_id, group_id)

    if group.is_system:
        raise HTTPException(
            status_code=403,
            detail=f"'{group.name}' é um grupo do sistema e não pode ser eliminado",
        )

    in_use = (
        db.query(Category)
        .filter(Category.company_id == company_id, Category.group_id == group_id)
        .count()
    )
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"O grupo tem {in_use} categoria(s). Mova-as ou elimine-as primeiro.",
        )

    db.delete(group)
    db.commit()
    return {"status": "success", "deleted_id": group_id}
