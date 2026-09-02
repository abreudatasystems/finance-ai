"""Invoice lines API — thin layer over app/services/invoice_lines.py.

Mounted under /transactions, so a document's lines live next to the document:
``/transactions/{id}/lines``.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import Transaction, User
from app.services import invoice_lines as service

router = APIRouter()


class LineIn(BaseModel):
    #: O artigo do catálogo, quando a linha vem de lá. Descritivo, preço e
    #: taxa que a linha não indique são herdados dele.
    item_id: Optional[str] = None
    description: str = ""

    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    #: Either quantity × unit price, or this base typed directly.
    net_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    #: Given only when the supplier's own rounding differs from ours.
    vat_amount: Optional[float] = None
    vat_exemption_reason: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None


class LinesReplace(BaseModel):
    lines: List[LineIn]


def _scoped(db: Session, company_id: str, trx_id: str) -> Transaction:
    trx = (
        db.query(Transaction)
        .filter(Transaction.id == trx_id, Transaction.company_id == company_id)
        .first()
    )
    if not trx:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return trx


@router.get("/{trx_id}/lines")
def get_lines(
    trx_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """The document's lines and its per-rate breakdown."""
    _scoped(db, company_id, trx_id)
    lines = service.list_lines(db, company_id, trx_id)
    return {
        "linhas": [service.serialize(l) for l in lines],
        "por_taxa": service.breakdown_by_rate(lines),
        "tem_linhas": bool(lines),
    }


@router.put("/{trx_id}/lines")
def replace_lines(
    trx_id: str,
    body: LinesReplace,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Replace the lines and re-derive the header totals from them."""
    trx = _scoped(db, company_id, trx_id)
    return service.replace_lines(db, company_id, trx, body.lines)


@router.delete("/{trx_id}/lines")
def delete_lines(
    trx_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Drop the lines; the header goes back to being the single source."""
    trx = _scoped(db, company_id, trx_id)
    return service.clear_lines(db, company_id, trx)
