"""Approvals API — thin HTTP layer over app/services/approvals.py.

Approving books an **obligation**, never a payment: the transaction is created
with ``payment_status=pending`` and its full amount outstanding, and only a
registered payment settles it.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.db.session import get_db
from app.models.models import User
from app.services import approvals as service

router = APIRouter()


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


class BatchDecision(BaseModel):
    approval_ids: List[str]
    action: str = "approved"
    rejection_reason: Optional[str] = None


@router.get("/")
def get_approvals(
    status: str = Query("pending", description="pending | approved | edited | rejected | all"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return service.list_queue(db, company_id, status)


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Counters for the queue header — declared before /{id} so it is not eaten by it."""
    return service.summary(db, company_id)


@router.get("/{approval_id}")
def get_approval(
    approval_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """One item with its document and the extraction behind it."""
    return service.detail(db, company_id, approval_id)


@router.post("/{approval_id}/action")
def action_approval(
    approval_id: str,
    action: str,
    decision: Optional[ApprovalDecision] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    return service.decide(
        db, company_id, current_user, approval_id, action, decision or ApprovalDecision(),
    )


@router.post("/batch")
def batch_action(
    body: BatchDecision,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Decide on several items at once — each outcome reported separately."""
    return service.decide_many(
        db, company_id, current_user, body.approval_ids, body.action,
        ApprovalDecision(rejection_reason=body.rejection_reason),
    )
