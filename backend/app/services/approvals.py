"""Approvals service — the human gate between what the AI read and what is booked.

The rules that must not drift live here rather than in the router:

* an approval creates an **obligation** (``status=approved``,
  ``payment_status=pending``, the whole amount outstanding). It never marks
  anything as paid — only a real payment does that;
* ``net + IVA = total`` always holds, whatever combination of fields the
  reviewer corrected;
* what the AI *read* (the extraction) is kept apart from what a human
  *decided*, so the trail stays honest.

The router above this file only maps HTTP to these functions.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import (
    AIApprovalItem, AIDocument, AIExtraction, AuditLog, Transaction, User,
)

CENTS = Decimal("0.01")
VALID_ACTIONS = {"approved", "rejected", "edited"}

#: Below this the queue flags the item for a closer look.
LOW_CONFIDENCE = 80


def _d(value) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _f(value) -> Optional[float]:
    return float(value) if value is not None else None


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------

def serialize(item: AIApprovalItem, document: Optional[AIDocument] = None) -> dict:
    """The shape the queue renders. Everything it needs, in one row."""
    return {
        "id": item.id,
        "company_id": item.company_id,
        "document_id": item.document_id,
        "document_name": item.document_name,
        "document_number": item.document_number,
        "document_type": item.document_type,
        "extraction_id": item.extraction_id,
        "supplier_name": item.supplier_name,
        "entity_id": item.entity_id,
        "amount": _f(item.amount),
        "net_amount": _f(item.net_amount),
        "vat_rate": item.vat_rate,
        "vat": _f(item.vat),
        "date": item.date,
        "due_date": item.due_date,
        "suggested_category": item.suggested_category,
        "suggested_category_id": item.suggested_category_id,
        "suggested_cost_center": item.suggested_cost_center,
        "ai_confidence": item.ai_confidence,
        "needs_attention": (item.ai_confidence or 0) < LOW_CONFIDENCE,
        "status": item.status,
        "transaction_id": item.transaction_id,
        "decided_by": item.decided_by,
        "decided_at": item.decided_at,
        "rejection_reason": item.rejection_reason,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        # The original document travels with the item so the reviewer can
        # always compare the numbers against the invoice itself.
        "file_url": document.file_url if document else None,
        "file_type": document.file_type if document else None,
        "file_name": document.file_name if document else item.document_name,
        "channel": document.channel if document else None,
    }


def list_queue(db: Session, company_id: str, status: str = "pending") -> list[dict]:
    query = db.query(AIApprovalItem).filter(AIApprovalItem.company_id == company_id)
    if status and status != "all":
        query = query.filter(AIApprovalItem.status == status)
    items = query.order_by(AIApprovalItem.created_at.desc()).all()
    if not items:
        return []

    documents = {
        d.id: d
        for d in db.query(AIDocument)
        .filter(AIDocument.company_id == company_id,
                AIDocument.id.in_([i.document_id for i in items]))
        .all()
    }
    return [serialize(i, documents.get(i.document_id)) for i in items]


def summary(db: Session, company_id: str) -> dict:
    """What the reviewer needs to know before opening the queue."""
    items = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.company_id == company_id)
        .all()
    )
    pending = [i for i in items if i.status == "pending"]
    return {
        "pendentes": len(pending),
        "valor_pendente": float(sum((i.amount or 0) for i in pending)),
        "por_rever": len([i for i in pending if (i.ai_confidence or 0) < LOW_CONFIDENCE]),
        "aprovados": len([i for i in items if i.status in ("approved", "edited")]),
        "rejeitados": len([i for i in items if i.status == "rejected"]),
        "limite_confianca": LOW_CONFIDENCE,
    }


def detail(db: Session, company_id: str, approval_id: str) -> dict:
    """One item with its document and the extraction behind it, for the inspector."""
    item = _scoped(db, company_id, approval_id)
    document = (
        db.query(AIDocument)
        .filter(AIDocument.id == item.document_id, AIDocument.company_id == company_id)
        .first()
    )
    extraction = None
    if item.extraction_id:
        extraction = (
            db.query(AIExtraction)
            .filter(AIExtraction.id == item.extraction_id, AIExtraction.company_id == company_id)
            .first()
        )
    if extraction is None:
        extraction = (
            db.query(AIExtraction)
            .filter(AIExtraction.document_id == item.document_id,
                    AIExtraction.company_id == company_id)
            .order_by(AIExtraction.processed_at.desc())
            .first()
        )

    checks = []
    if extraction and extraction.validation_report:
        try:
            checks = json.loads(extraction.validation_report)
        except (ValueError, TypeError):
            checks = []

    return {
        "approval": serialize(item, document),
        # What the AI read, kept distinct from what the reviewer will decide.
        "extraction": {
            "id": extraction.id,
            "supplier": extraction.supplier,
            "nif": extraction.nif,
            "document_number": extraction.document_number,
            "document_date": extraction.document_date,
            "due_date": extraction.due_date,
            "net_amount": _f(extraction.net_amount),
            "vat_rate": extraction.vat_rate,
            "vat_amount": _f(extraction.vat_amount),
            "gross_amount": _f(extraction.gross_amount),
            "currency": extraction.currency,
            "confidence": extraction.confidence,
            "validation_status": extraction.validation_status,
            "ai_model": extraction.ai_model,
            "processed_at": extraction.processed_at.isoformat() if extraction.processed_at else None,
        } if extraction else None,
        "validation": checks,
    }


def _scoped(db: Session, company_id: str, approval_id: str) -> AIApprovalItem:
    item = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.id == approval_id, AIApprovalItem.company_id == company_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item de aprovação não encontrado")
    return item


# --------------------------------------------------------------------------
# Deciding
# --------------------------------------------------------------------------

def coherent_amounts(gross, vat_rate, vat, net):
    """Return a (net, vat, gross) triple that always satisfies net + vat = gross."""
    gross = gross or Decimal("0.00")
    if net is not None:
        vat = (gross - net).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif vat is not None and vat > 0:
        net = (gross - vat).quantize(CENTS, rounding=ROUND_HALF_UP)
    elif vat_rate:
        rate = Decimal(str(vat_rate)) / Decimal("100")
        net = (gross / (Decimal("1") + rate)).quantize(CENTS, rounding=ROUND_HALF_UP)
        vat = (gross - net).quantize(CENTS, rounding=ROUND_HALF_UP)
    else:
        net, vat = gross, Decimal("0.00")
    return net, vat, gross


def set_document_status(db: Session, item: AIApprovalItem, company_id: str, status: str) -> None:
    doc = (
        db.query(AIDocument)
        .filter(AIDocument.id == item.document_id, AIDocument.company_id == company_id)
        .first()
    )
    if doc:
        doc.status = status


def audit(db: Session, company_id: str, now, user: str, action: str,
          description: str, entity_id: Optional[str]) -> None:
    db.add(AuditLog(
        id=f"AUD-{int(now.timestamp() * 1000000)}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=user,
        action=action,
        module="Aprovações",
        description=description,
        entity_id=entity_id,
    ))


def decide(db: Session, company_id: str, current_user: User, approval_id: str,
           action: str, decision) -> dict:
    """Approve (optionally with corrections) or reject one item."""
    if action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="Ação inválida")

    item = _scoped(db, company_id, approval_id)
    if item.status != "pending":
        raise HTTPException(status_code=409, detail=f"Item já foi {item.status}")

    now = datetime.now(timezone.utc)
    d = decision

    if action == "rejected":
        item.status = "rejected"
        item.decided_by = current_user.name
        item.decided_at = now.isoformat()
        item.rejection_reason = getattr(d, "rejection_reason", None)
        set_document_status(db, item, company_id, "rejected")
        audit(db, company_id, now, current_user.name, "Rejeição IA",
              f"Rejeitou {item.supplier_name} ({item.amount}): "
              f"{item.rejection_reason or 'sem motivo'}", item.document_id)
        db.commit()
        return {"status": "success", "action": "rejected", "approval_id": item.id}

    gross = _d(d.amount) if d.amount is not None else _d(item.amount)
    vat_rate = d.vat_rate if d.vat_rate is not None else item.vat_rate

    # When the reviewer corrects the total but says nothing about the split, the
    # extracted base and VAT no longer describe this invoice — dropping them
    # makes the rate recompute both. Keeping them would silently produce a VAT
    # amount that does not match the rate (130 € at 23% is 105,69 + 24,31,
    # never 100 + 30).
    gross_changed = d.amount is not None and gross != _d(item.amount)
    vat = _d(d.vat_amount) if d.vat_amount is not None else (None if gross_changed else _d(item.vat))
    net = _d(d.net_amount) if d.net_amount is not None else (None if gross_changed else _d(item.net_amount))

    net, vat, gross = coherent_amounts(gross, vat_rate, vat, net)

    category_id = d.category_id or item.suggested_category_id or ""
    category_name = d.category_name or item.suggested_category or "Por classificar"
    due_date = d.due_date or item.due_date or item.date

    trx_id = f"TRX-APP-{int(now.timestamp() * 1000)}"
    document = (
        db.query(AIDocument)
        .filter(AIDocument.id == item.document_id, AIDocument.company_id == company_id)
        .first()
    )

    new_trx = Transaction(
        id=trx_id,
        company_id=company_id,
        date=item.date,
        due_date=due_date,
        type="expense",
        description=f"{item.document_number or item.document_name} - {item.supplier_name}",
        entity_name=item.supplier_name,
        entity_id=item.entity_id,
        category_id=category_id,
        category_name=category_name,
        cost_center_name=d.cost_center_name or item.suggested_cost_center or "Geral",
        # Full VAT breakdown so the fiscal reports can aggregate correctly.
        amount=gross,
        net_amount=net,
        vat_rate=vat_rate,
        vat_amount=vat,
        gross_amount=gross,
        currency="EUR",
        # An approved invoice is an obligation, not a settled payment.
        paid_amount=Decimal("0.00"),
        outstanding_amount=gross,
        payment_status="pending",
        status="approved",
        source="ai",
        ai_confidence=item.ai_confidence,
        document_id=item.document_id,
        document_name=item.document_name,
        document_number=item.document_number,
        document_type=item.document_type,
        document_date=item.date,
        document_url=document.file_url if document else None,
        created_by="Motor IA",
        approved_by=current_user.name,
        approved_at=now.isoformat(),
    )
    db.add(new_trx)

    item.status = "edited" if action == "edited" else "approved"
    item.transaction_id = trx_id
    item.decided_by = current_user.name
    item.decided_at = now.isoformat()
    set_document_status(db, item, company_id, "approved")

    audit(db, company_id, now, current_user.name, "Aprovação IA",
          f"Aprovou {item.supplier_name}: total {gross}, IVA {vat} — "
          f"obrigação a pagar até {due_date}", trx_id)

    db.commit()
    return {
        "status": "success",
        "action": item.status,
        "approval_id": item.id,
        "transaction_id": trx_id,
        "payment_status": "pending",
        "outstanding_amount": float(gross),
    }


def decide_many(db: Session, company_id: str, current_user: User,
                approval_ids: Iterable[str], action: str, decision) -> dict:
    """Decide on several items at once, reporting each outcome separately.

    One bad item does not sink the batch: the rest still go through, and the
    caller is told exactly which failed and why.
    """
    done, failed = [], []
    for approval_id in approval_ids:
        try:
            done.append(decide(db, company_id, current_user, approval_id, action, decision))
        except HTTPException as exc:
            db.rollback()
            failed.append({"approval_id": approval_id, "detail": exc.detail})
    return {
        "status": "success" if not failed else "partial",
        "decididos": len(done),
        "falhados": len(failed),
        "resultados": done,
        "erros": failed,
    }
