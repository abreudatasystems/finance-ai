from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id, get_current_user
from app.models.models import AIApprovalItem, Transaction, AuditLog, User

router = APIRouter()

VALID_ACTIONS = {"approved", "rejected", "edited"}


@router.get("/")
def get_approvals(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.company_id == company_id, AIApprovalItem.status == "pending")
        .all()
    )


@router.post("/{approval_id}/action")
def action_approval(
    approval_id: str,
    action: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
):
    if action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="Ação inválida")

    # Scope the lookup to the caller's tenant so items from other companies
    # can never be actioned.
    app_item = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.id == approval_id, AIApprovalItem.company_id == company_id)
        .first()
    )
    if not app_item:
        raise HTTPException(status_code=404, detail="Item de aprovação não encontrado")

    app_item.status = action
    now = datetime.now(timezone.utc)

    if action == "approved":
        trx_id = f"TRX-APP-{int(now.timestamp() * 1000)}"
        new_trx = Transaction(
            id=trx_id,
            company_id=app_item.company_id,
            date=app_item.date,
            due_date=app_item.date,
            type="expense",
            description=f"Fatura {app_item.document_name} - {app_item.supplier_name}",
            entity_name=app_item.supplier_name,
            category_id=app_item.suggested_category_id,
            category_name=app_item.suggested_category,
            cost_center_name=app_item.suggested_cost_center or "Geral",
            amount=app_item.amount,
            vat_amount=app_item.vat,
            status="paid",
            source="ai",
            ai_confidence=app_item.ai_confidence,
            document_id=app_item.document_id,
            document_name=app_item.document_name,
        )
        db.add(new_trx)

        audit = AuditLog(
            id=f"AUD-{int(now.timestamp() * 1000)}",
            company_id=app_item.company_id,
            timestamp=now.isoformat(),
            user=current_user.name,
            action="Aprovação IA",
            module="Aprovações",
            description=f"Aprovou lançamento {app_item.supplier_name} ({app_item.amount})",
            entity_id=trx_id,
        )
        db.add(audit)

    db.commit()
    return {"status": "success", "action": action}
