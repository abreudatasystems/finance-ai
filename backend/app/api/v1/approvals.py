from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user
from app.db.session import get_db
from app.models.models import AIApprovalItem, AIDocument, AuditLog, Transaction, User

router = APIRouter()

CENTS = Decimal("0.01")
VALID_ACTIONS = {"approved", "rejected", "edited"}


def _d(value) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


class ApprovalDecision(BaseModel):
    """Optional corrections applied by the reviewer before approving."""
    amount: Optional[float] = None
    net_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    cost_center_name: Optional[str] = None
    due_date: Optional[str] = None
    rejection_reason: Optional[str] = None


@router.get("/")
def get_approvals(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.company_id == company_id, AIApprovalItem.status == "pending")
        .order_by(AIApprovalItem.created_at.desc())
        .all()
    )


@router.post("/{approval_id}/action")
def action_approval(
    approval_id: str,
    action: str,
    decision: Optional[ApprovalDecision] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
):
    """Decide on a pending item.

    Approving creates a financial **obligation** — never a settled payment.
    The transaction is booked as ``status=approved`` with
    ``payment_status=pending`` and its full amount outstanding; it only
    becomes paid when a payment is actually registered.
    """
    if action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="Ação inválida")

    item = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.id == approval_id, AIApprovalItem.company_id == company_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item de aprovação não encontrado")
    if item.status != "pending":
        raise HTTPException(status_code=409, detail=f"Item já foi {item.status}")

    now = datetime.now(timezone.utc)
    d = decision or ApprovalDecision()

    if action == "rejected":
        item.status = "rejected"
        item.decided_by = current_user.name
        item.decided_at = now.isoformat()
        item.rejection_reason = d.rejection_reason
        _set_document_status(db, item, company_id, "rejected")
        _audit(db, company_id, now, current_user.name, "Rejeição IA",
               f"Rejeitou {item.supplier_name} ({item.amount}): {d.rejection_reason or 'sem motivo'}",
               item.document_id)
        db.commit()
        return {"status": "success", "action": "rejected", "approval_id": item.id}

    # --- Approve (optionally with reviewer corrections) ---
    gross = _d(d.amount) if d.amount is not None else _d(item.amount)
    vat_rate = d.vat_rate if d.vat_rate is not None else item.vat_rate
    vat = _d(d.vat_amount) if d.vat_amount is not None else _d(item.vat)
    net = _d(d.net_amount) if d.net_amount is not None else _d(item.net_amount)

    net, vat, gross = _coherent_amounts(gross, vat_rate, vat, net)

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
        # Full VAT breakdown so the fiscal/VAT reports can aggregate correctly.
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
    _set_document_status(db, item, company_id, "approved")

    _audit(db, company_id, now, current_user.name, "Aprovação IA",
           f"Aprovou {item.supplier_name}: total {gross}, IVA {vat} — obrigação a pagar até {due_date}",
           trx_id)

    db.commit()
    db.refresh(new_trx)
    return {
        "status": "success",
        "action": item.status,
        "transaction_id": trx_id,
        "payment_status": "pending",
        "outstanding_amount": float(gross),
    }


def _coherent_amounts(gross, vat_rate, vat, net):
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


def _set_document_status(db: Session, item: AIApprovalItem, company_id: str, status: str) -> None:
    doc = (
        db.query(AIDocument)
        .filter(AIDocument.id == item.document_id, AIDocument.company_id == company_id)
        .first()
    )
    if doc:
        doc.status = status


def _audit(db: Session, company_id: str, now, user: str, action: str, description: str, entity_id: str) -> None:
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
