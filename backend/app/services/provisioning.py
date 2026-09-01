"""Applies a chart-of-accounts template to a company.

All the database work lives here; the catalog stays pure data. Two guarantees:

* **Idempotent** — every row carries the template's ``source_key``, so applying
  the same plan twice never duplicates anything.
* **Non-destructive** — a restore only fills in what is missing. Categories the
  company renamed, or deliberately deleted and does not want back, are decided
  by the caller through ``include_deleted``.

Groups are structural and always ensured. Categories are provisioned once, so
that deleting one makes it stay deleted instead of reappearing on the next read.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.catalog.registry import get_template
from app.catalog.types import CategorySpec, ChartTemplate, GroupSpec
from app.models.models import Category, CategoryGroup, Company


def _group_id(company_id: str, spec: GroupSpec) -> str:
    return f"GRP-{company_id}-{spec.key.upper()}"


def _category_id(company_id: str, spec: CategorySpec) -> str:
    return f"CAT-{company_id}-{spec.key.upper()}"


def ensure_groups(db: Session, company_id: str, template: Optional[ChartTemplate] = None) -> Dict[str, CategoryGroup]:
    """Make sure the template's groups exist. Returns them keyed by spec key."""
    template = template or get_template()
    existing = {
        g.id: g
        for g in db.query(CategoryGroup).filter(CategoryGroup.company_id == company_id).all()
    }

    out: Dict[str, CategoryGroup] = {}
    created = False
    for order, spec in enumerate(template.groups):
        gid = _group_id(company_id, spec)
        group = existing.get(gid)
        if group is None:
            group = CategoryGroup(
                id=gid,
                company_id=company_id,
                name=spec.name,
                kind=spec.kind,
                icon=spec.icon,
                color=spec.color,
                description=spec.description,
                is_system=spec.is_system,
                sort_order=order,
                active=True,
            )
            db.add(group)
            created = True
        out[spec.key] = group

    if created:
        db.flush()
        # Attach any pre-existing loose categories to the group of their nature.
        for spec in template.groups:
            (db.query(Category)
               .filter(Category.company_id == company_id,
                       Category.group_id.is_(None),
                       Category.type == spec.kind)
               .update({Category.group_id: _group_id(company_id, spec)},
                       synchronize_session=False))
        db.commit()
    return out


def _existing_source_keys(db: Session, company_id: str) -> set:
    rows = (
        db.query(Category.id)
        .filter(Category.company_id == company_id, Category.is_system.is_(True))
        .all()
    )
    return {r[0] for r in rows}


def apply_template(db: Session, company_id: str, template_code: Optional[str] = None) -> dict:
    """Create the template's categories for a company, skipping what exists."""
    template = get_template(template_code)
    groups = ensure_groups(db, company_id, template)

    present = _existing_source_keys(db, company_id)
    created: List[str] = []
    skipped = 0

    def add(spec: CategorySpec, group: CategoryGroup, parent_id: Optional[str]) -> None:
        nonlocal skipped
        cid = _category_id(company_id, spec)
        if cid in present:
            skipped += 1
        else:
            db.add(Category(
                id=cid,
                company_id=company_id,
                type=group.kind,
                group_id=group.id,
                name=spec.name,
                parent_id=parent_id,
                description=spec.description,
                keywords=",".join(spec.keywords) if spec.keywords else None,
                active=True,
                is_system=True,
                source_key=spec.key,
                snc_code=spec.snc,
            ))
            created.append(spec.key)
        for child in spec.children:
            add(child, group, cid)

    for gspec in template.groups:
        group = groups[gspec.key]
        for cspec in gspec.categories:
            add(cspec, group, None)

    company = db.query(Company).filter(Company.id == company_id).first()
    if company:
        company.chart_template = template.code
        company.chart_provisioned = True

    db.commit()
    return {
        "template": template.code,
        "template_name": template.name,
        "created": len(created),
        "skipped": skipped,
        "created_keys": created,
    }


def ensure_provisioned(db: Session, company_id: str) -> None:
    """Provision the default chart once, for companies that never got it.

    Runs only when the company has never been provisioned, so a category the
    company deleted afterwards stays deleted.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if company is None:
        return
    if company.chart_provisioned:
        ensure_groups(db, company_id, get_template(company.chart_template))
        return
    apply_template(db, company_id, company.chart_template)


def restore_defaults(db: Session, company_id: str, template_code: Optional[str] = None) -> dict:
    """Re-add the standard categories that are missing, leaving edits alone."""
    company = db.query(Company).filter(Company.id == company_id).first()
    code = template_code or (company.chart_template if company else None)
    return apply_template(db, company_id, code)
