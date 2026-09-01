"""Alerts API — thin layer over app/services/alerts.py.

Everything is computed on read, so there is nothing to mark as seen and
nothing that can outlive the problem it describes.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id
from app.db.session import get_db
from app.services import alerts as service

router = APIRouter()


@router.get("/")
def get_alerts(
    today: Optional[str] = Query(None, description="Só para testes: avalia como se fosse este dia."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """What is due, what slipped, and what looks wrong — worst first."""
    reference = None
    if today:
        try:
            reference = date.fromisoformat(today)
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida (use AAAA-MM-DD).")
    return service.collect(db, company_id, reference)
