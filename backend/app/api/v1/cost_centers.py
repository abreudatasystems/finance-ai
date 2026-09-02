"""Projetos e centros de custo — o trabalho a que os documentos pertencem."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, require_write
from app.db.session import get_db
from app.models.models import User
from app.services import cost_centers as service

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    contract_value: Optional[float] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    started_on: Optional[str] = None
    ended_on: Optional[str] = None
    status: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    contract_value: Optional[float] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    started_on: Optional[str] = None
    ended_on: Optional[str] = None
    status: Optional[str] = None
    active: Optional[bool] = None


def _window(start: Optional[str], end: Optional[str]) -> tuple[str, str]:
    """The year to date by default — the window a margin is judged over."""
    today = date.today()
    return (start or date(today.year, 1, 1).isoformat(),
            end or date(today.year + 1, 1, 1).isoformat())


@router.get("/")
def list_projects(
    include_closed: bool = Query(True),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return service.listing(db, company_id, include_closed)


@router.get("/profitability")
def profitability(
    start: Optional[str] = Query(None, description="AAAA-MM-DD; por omissão, 1 de janeiro."),
    end: Optional[str] = Query(None, description="AAAA-MM-DD exclusivo."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Margem por projeto, na mesma base da Demonstração de Resultados."""
    window_start, window_end = _window(start, end)
    return service.profitability(db, company_id, window_start, window_end)


@router.get("/{centre_id}")
def get_project(
    centre_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return service.serialize(service.scoped(db, company_id, centre_id))


@router.get("/{centre_id}/statement")
def project_statement(
    centre_id: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Um projeto, documento a documento."""
    return service.statement(db, company_id, centre_id, start, end)


@router.post("/", status_code=201)
def create_project(
    item: ProjectCreate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    return service.create(db, company_id, item.model_dump(exclude_unset=True))


@router.patch("/{centre_id}")
def update_project(
    centre_id: str,
    patch: ProjectUpdate,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    return service.update(db, company_id, centre_id, patch.model_dump(exclude_unset=True))


@router.delete("/{centre_id}")
def delete_project(
    centre_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Elimina o que nada aponta; fecha o que já tem histórico."""
    return service.remove(db, company_id, centre_id)
