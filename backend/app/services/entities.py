"""Entities — the counterparties, and what each of them owes or is owed.

One table for suppliers and customers, because they were always the same
thing: a company you deal with. The role is a property (``is_supplier`` /
``is_customer``), not a separate record, so a supplier you also invoice has
one NIF, one contact, and one account to look at.

Balances are **derived** from the transactions on every read. A stored total
is a number that goes stale the moment a payment lands; this one cannot.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Entity, Transaction

CENTS = Decimal("0.01")
PLACEHOLDER_NIFS = {"000000000", "500000000"}


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def normalise_nif(nif: Optional[str]) -> str:
    """Digits only — 'PT 503 504 564' and '503504564' are the same taxpayer."""
    return "".join(ch for ch in (nif or "") if ch.isdigit())


def match_key(nif: Optional[str], name: str) -> str:
    """How two records are judged to be the same company."""
    clean = normalise_nif(nif)
    if clean and clean not in PLACEHOLDER_NIFS:
        return f"nif:{clean}"
    return f"name:{(name or '').strip().lower()}"


# --------------------------------------------------------------------------
# Balances
# --------------------------------------------------------------------------

def _movements(db: Session, company_id: str, entity: Entity) -> list[Transaction]:
    """This entity's transactions, including rows that predate entity_id."""
    return (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            (Transaction.entity_id == entity.id) | (Transaction.entity_name == entity.name),
        )
        .order_by(Transaction.date.desc())
        .all()
    )


def balances(movements: Iterable[Transaction]) -> dict:
    """What was invoiced, what was settled, and what is still open — per side."""
    out = {
        "compras": {"faturado": Decimal("0.00"), "pago": Decimal("0.00"), "em_divida": Decimal("0.00"), "documentos": 0},
        "vendas": {"faturado": Decimal("0.00"), "recebido": Decimal("0.00"), "por_receber": Decimal("0.00"), "documentos": 0},
    }
    last = None
    for trx in movements:
        if trx.status == "cancelled":
            continue
        gross = _d(trx.gross_amount if trx.gross_amount is not None else trx.amount)
        paid = _d(trx.paid_amount)
        open_amount = (gross - paid).quantize(CENTS, rounding=ROUND_HALF_UP)
        if trx.type == "expense":
            out["compras"]["faturado"] += gross
            out["compras"]["pago"] += paid
            out["compras"]["em_divida"] += open_amount
            out["compras"]["documentos"] += 1
        elif trx.type == "income":
            out["vendas"]["faturado"] += gross
            out["vendas"]["recebido"] += paid
            out["vendas"]["por_receber"] += open_amount
            out["vendas"]["documentos"] += 1
        last = last or trx.date

    return {
        "compras": {k: (float(v) if isinstance(v, Decimal) else v) for k, v in out["compras"].items()},
        "vendas": {k: (float(v) if isinstance(v, Decimal) else v) for k, v in out["vendas"].items()},
        # Positive: we owe them more than they owe us.
        "saldo": float((out["compras"]["em_divida"] - out["vendas"]["por_receber"])
                       .quantize(CENTS, rounding=ROUND_HALF_UP)),
        "ultimo_movimento": last,
    }


def serialize(entity: Entity, stats: Optional[dict] = None) -> dict:
    data = {
        "id": entity.id,
        "company_id": entity.company_id,
        "name": entity.name,
        "nif": entity.nif,
        "email": entity.email,
        "phone": entity.phone,
        "address": entity.address,
        "is_supplier": bool(entity.is_supplier),
        "is_customer": bool(entity.is_customer),
        "papel": _role_label(entity),
        "default_category_id": entity.default_category_id,
        "default_category_name": entity.default_category_name,
        "notes": entity.notes,
        "active": entity.active is not False,
        "created_at": entity.created_at.isoformat() if entity.created_at else None,
    }
    if stats:
        data.update(stats)
    return data


def _role_label(entity: Entity) -> str:
    if entity.is_supplier and entity.is_customer:
        return "Fornecedor e cliente"
    if entity.is_supplier:
        return "Fornecedor"
    if entity.is_customer:
        return "Cliente"
    return "Sem papel definido"


def with_balances(db: Session, company_id: str, entities: Iterable[Entity]) -> list[dict]:
    """Serialise a list, computing every balance in one pass over the movements."""
    entities = list(entities)
    if not entities:
        return []

    rows = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id)
        .all()
    )
    by_id: dict = {}
    by_name: dict = {}
    for trx in rows:
        if trx.entity_id:
            by_id.setdefault(trx.entity_id, []).append(trx)
        if trx.entity_name:
            by_name.setdefault(trx.entity_name, []).append(trx)

    out = []
    for entity in entities:
        movements = by_id.get(entity.id) or by_name.get(entity.name) or []
        out.append(serialize(entity, balances(movements)))
    return out


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------

def scoped(db: Session, company_id: str, entity_id: str) -> Entity:
    entity = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.company_id == company_id)
        .first()
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entidade não encontrada")
    return entity


def find_duplicate(db: Session, company_id: str, nif: Optional[str], name: str,
                   exclude_id: Optional[str] = None) -> Optional[Entity]:
    """The same company under a different spelling, if it is already here."""
    key = match_key(nif, name)
    query = db.query(Entity).filter(Entity.company_id == company_id)
    if exclude_id:
        query = query.filter(Entity.id != exclude_id)
    for candidate in query.all():
        if match_key(candidate.nif, candidate.name) == key:
            return candidate
    return None


def create(db: Session, company_id: str, data: dict) -> Entity:
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome é obrigatório")
    if not data.get("is_supplier") and not data.get("is_customer"):
        raise HTTPException(
            status_code=400,
            detail="Indique se é fornecedor, cliente, ou os dois.",
        )

    duplicate = find_duplicate(db, company_id, data.get("nif"), name)
    if duplicate:
        # Not an error worth blocking on: add the missing role to the entity
        # that already exists, which is exactly what the user meant.
        duplicate.is_supplier = bool(duplicate.is_supplier or data.get("is_supplier"))
        duplicate.is_customer = bool(duplicate.is_customer or data.get("is_customer"))
        duplicate.email = duplicate.email or data.get("email")
        duplicate.phone = duplicate.phone or data.get("phone")
        duplicate.address = duplicate.address or data.get("address")
        db.commit()
        db.refresh(duplicate)
        return duplicate

    entity = Entity(
        id=f"ENT-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        company_id=company_id,
        name=name,
        nif=(data.get("nif") or "").strip() or None,
        email=data.get("email"),
        phone=data.get("phone"),
        address=data.get("address"),
        is_supplier=bool(data.get("is_supplier")),
        is_customer=bool(data.get("is_customer")),
        default_category_id=data.get("default_category_id"),
        default_category_name=data.get("default_category_name"),
        notes=data.get("notes"),
        active=True,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def update(db: Session, company_id: str, entity_id: str, data: dict) -> Entity:
    entity = scoped(db, company_id, entity_id)

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome é obrigatório")
        data["name"] = name

    if ("nif" in data or "name" in data):
        clash = find_duplicate(
            db, company_id,
            data.get("nif", entity.nif), data.get("name", entity.name),
            exclude_id=entity.id,
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"'{clash.name}' já existe com o mesmo NIF. Junte as duas em vez de duplicar.",
            )

    for field, value in data.items():
        setattr(entity, field, value)
    db.commit()
    db.refresh(entity)
    return entity


def remove(db: Session, company_id: str, entity_id: str) -> dict:
    """Delete only what has no history; anything with movements is deactivated.

    Deleting an entity that appears on booked documents would leave those
    documents pointing at nothing, so it is refused in favour of archiving.
    """
    entity = scoped(db, company_id, entity_id)
    movements = _movements(db, company_id, entity)
    if movements:
        entity.active = False
        db.commit()
        return {
            "status": "archived",
            "entity_id": entity_id,
            "movimentos": len(movements),
            "message": (
                f"'{entity.name}' tem {len(movements)} movimento(s) e foi arquivada em vez de "
                "eliminada, para o histórico continuar completo."
            ),
        }
    db.delete(entity)
    db.commit()
    return {"status": "deleted", "entity_id": entity_id}


def merge(db: Session, company_id: str, keep_id: str, merge_id: str) -> dict:
    """Fold one entity into another, moving its movements across."""
    if keep_id == merge_id:
        raise HTTPException(status_code=400, detail="Indique duas entidades diferentes")
    keep = scoped(db, company_id, keep_id)
    other = scoped(db, company_id, merge_id)

    moved = 0
    for trx in _movements(db, company_id, other):
        trx.entity_id = keep.id
        trx.entity_name = keep.name
        moved += 1

    keep.is_supplier = bool(keep.is_supplier or other.is_supplier)
    keep.is_customer = bool(keep.is_customer or other.is_customer)
    keep.email = keep.email or other.email
    keep.phone = keep.phone or other.phone
    keep.address = keep.address or other.address
    keep.nif = keep.nif or other.nif

    db.delete(other)
    db.commit()
    db.refresh(keep)
    return {"status": "success", "entity_id": keep.id, "movimentos_movidos": moved}


def statement(db: Session, company_id: str, entity_id: str) -> dict:
    """The account: every document, what is settled, what is still open."""
    entity = scoped(db, company_id, entity_id)
    movements = _movements(db, company_id, entity)
    return {
        "entidade": serialize(entity, balances(movements)),
        "movimentos": [
            {
                "id": t.id,
                "date": t.date,
                "due_date": t.due_date,
                "type": t.type,
                "description": t.description,
                "document_number": t.document_number,
                "category_name": t.category_name,
                "amount": float(_d(t.gross_amount if t.gross_amount is not None else t.amount)),
                "paid_amount": float(_d(t.paid_amount)),
                "outstanding_amount": float(_d(t.outstanding_amount)),
                "payment_status": t.payment_status,
                "status": t.status,
            }
            for t in movements
        ],
    }
