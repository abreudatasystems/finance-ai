"""Rentabilidade por projeto.

A services company invoices 6 150 € on a job and has no idea whether it made
money on it. The product knew the revenue and knew the costs; it had no way of
saying which costs belonged to which work, so the only margin it could report
was the company's, once a month, too late to change anything.

Two things keep this from being another number nobody trusts:

**The same basis as everything else.** Revenue and cost come from the documents
dated in the window, net of VAT, on the accrual basis — the same primitives the
income statement and the budget use. A project's figures and the company's
result add up, because they are the same figures grouped differently.

**"Sem projeto" is a row, not a rounding error.** Whatever is not attributed to
any project appears with its own total. A profitability report that quietly
drops half the business is worse than none: it produces confident margins on a
fraction of the company and calls them the company's.

Nothing is stored except the plan. What was spent is derived every time, so a
project's margin cannot drift away from the documents behind it.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import CostCenter, Transaction
from app.services import financials

CENTS = Decimal("0.01")

VALID_STATUSES = {"open", "closed"}

#: The bucket for documents that belong to no project.
UNASSIGNED = "sem-projeto"


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _pct(part: Decimal, whole: Decimal) -> Optional[float]:
    if whole <= 0:
        return None
    return float((part / whole * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# The projects themselves
# ---------------------------------------------------------------------------

def serialize(centre: CostCenter) -> dict:
    return {
        "id": centre.id,
        "codigo": centre.code,
        "nome": centre.name,
        "descricao": centre.description,
        "orcamento": float(_d(centre.budget)) if centre.budget is not None else None,
        "valor_contratado": (
            float(_d(centre.contract_value)) if centre.contract_value is not None else None
        ),
        "entity_id": centre.entity_id,
        "cliente": centre.entity_name,
        "inicio": centre.started_on,
        "fim": centre.ended_on,
        "estado": centre.status or "open",
        "ativo": centre.active is not False,
    }


def scoped(db: Session, company_id: str, centre_id: str) -> CostCenter:
    centre = (
        db.query(CostCenter)
        .filter(CostCenter.id == centre_id, CostCenter.company_id == company_id)
        .first()
    )
    if not centre:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return centre


def listing(db: Session, company_id: str, include_closed: bool = True) -> list[dict]:
    query = db.query(CostCenter).filter(CostCenter.company_id == company_id)
    if not include_closed:
        query = query.filter(CostCenter.status != "closed", CostCenter.active.isnot(False))
    return [serialize(c) for c in query.order_by(CostCenter.code, CostCenter.name).all()]


def create(db: Session, company_id: str, data: dict) -> dict:
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome do projeto é obrigatório")

    code = (data.get("code") or "").strip() or _next_code(db, company_id)
    clash = (
        db.query(CostCenter)
        .filter(CostCenter.company_id == company_id)
        .filter(CostCenter.code.ilike(code))
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail=f"Já existe um projeto com o código '{code}'")

    status = data.get("status") or "open"
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Estado inválido. Use 'open' ou 'closed'.")

    centre = CostCenter(
        id=f"CC-{int(datetime.now(timezone.utc).timestamp() * 1000000)}",
        company_id=company_id,
        code=code,
        name=name,
        description=data.get("description"),
        budget=_d(data["budget"]) if data.get("budget") is not None else None,
        contract_value=(
            _d(data["contract_value"]) if data.get("contract_value") is not None else None
        ),
        entity_id=data.get("entity_id"),
        entity_name=data.get("entity_name"),
        started_on=data.get("started_on"),
        ended_on=data.get("ended_on"),
        status=status,
        active=True,
    )
    db.add(centre)
    db.commit()
    db.refresh(centre)
    return serialize(centre)


def _next_code(db: Session, company_id: str) -> str:
    """P-001, P-002 … so a project always has a code to be found by."""
    count = db.query(CostCenter).filter(CostCenter.company_id == company_id).count()
    return f"P-{count + 1:03d}"


def update(db: Session, company_id: str, centre_id: str, data: dict) -> dict:
    centre = scoped(db, company_id, centre_id)

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome do projeto é obrigatório")
        data["name"] = name

    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Estado inválido. Use 'open' ou 'closed'.")

    for field in ("budget", "contract_value"):
        if field in data and data[field] is not None:
            data[field] = _d(data[field])

    for field, value in data.items():
        setattr(centre, field, value)

    db.commit()
    db.refresh(centre)
    return serialize(centre)


def remove(db: Session, company_id: str, centre_id: str) -> dict:
    """Delete only what nothing points at; otherwise close it.

    Deleting a project that documents belong to would orphan their history, so
    a used project is closed instead — it stops being offered without anything
    being lost.
    """
    centre = scoped(db, company_id, centre_id)
    in_use = (
        db.query(Transaction)
        .filter(Transaction.company_id == company_id,
                Transaction.cost_center_id == centre_id)
        .count()
    )
    if in_use:
        centre.status = "closed"
        centre.active = False
        db.commit()
        return {
            "status": "closed",
            "id": centre_id,
            "documentos": in_use,
            "detalhe": (
                f"O projeto tem {in_use} documento(s) e foi fechado em vez de "
                "eliminado, para não perder o histórico."
            ),
        }

    db.delete(centre)
    db.commit()
    return {"status": "success", "deleted_id": centre_id}


# ---------------------------------------------------------------------------
# Profitability
# ---------------------------------------------------------------------------

def _key(trx: Transaction) -> str:
    """What a document is grouped under.

    Documents carry a free-text cost centre name from before projects were
    managed, so the name stands in when there is no id — otherwise every
    historical document would land in "sem projeto" and the report would say
    the company never attributed anything.
    """
    if trx.cost_center_id:
        return trx.cost_center_id
    name = (trx.cost_center_name or "").strip()
    return f"nome:{name.lower()}" if name else UNASSIGNED


def profitability(db: Session, company_id: str, start: str, end: str) -> dict:
    """Revenue, cost and margin per project, on the income statement's basis."""
    rows = financials.documents_in_period(db, company_id, start, end)
    nets = financials.line_net_totals(db, company_id, [t.id for t in rows])

    centres = {
        c.id: c for c in db.query(CostCenter).filter(
            CostCenter.company_id == company_id,
        ).all()
    }

    groups: dict = {}
    for trx in rows:
        key = _key(trx)
        centre = centres.get(trx.cost_center_id)
        entry = groups.setdefault(key, {
            "id": trx.cost_center_id,
            "codigo": centre.code if centre else None,
            "projeto": (
                centre.name if centre
                else (trx.cost_center_name or "").strip() or "Sem projeto"
            ),
            "cliente": centre.entity_name if centre else None,
            "orcamento": (
                float(_d(centre.budget)) if centre and centre.budget is not None else None
            ),
            "valor_contratado": (
                float(_d(centre.contract_value))
                if centre and centre.contract_value is not None else None
            ),
            "estado": centre.status if centre else None,
            # A project the documents name but nobody ever created: worth
            # showing as such rather than pretending it is managed.
            "por_criar": centre is None and key != UNASSIGNED,
            "sem_projeto": key == UNASSIGNED,
            "_rendimentos": Decimal("0.00"),
            "_gastos": Decimal("0.00"),
            "documentos": 0,
        })
        amount = financials.net_of(trx, nets)
        if trx.type == "income":
            entry["_rendimentos"] += amount
        elif trx.type == "expense":
            entry["_gastos"] += amount
        entry["documentos"] += 1

    projects = []
    for entry in groups.values():
        revenue = entry.pop("_rendimentos")
        cost = entry.pop("_gastos")
        margin = (revenue - cost).quantize(CENTS, rounding=ROUND_HALF_UP)
        budget = _d(entry["orcamento"]) if entry["orcamento"] is not None else None
        projects.append({
            **entry,
            "rendimentos": float(revenue),
            "gastos": float(cost),
            "margem": float(margin),
            "margem_pct": _pct(margin, revenue),
            # Only meaningful where a budget was set: a project with no plan
            # cannot be over or under it.
            "orcamento_usado_pct": _pct(cost, budget) if budget and budget > 0 else None,
            "acima_do_orcamento": bool(budget and budget > 0 and cost > budget),
        })

    # Losses first: the point of the report is to find the work that costs
    # more than it brings, and it should not be at the bottom of the page.
    projects.sort(key=lambda p: (p["sem_projeto"], p["margem"]))

    total_revenue = sum((_d(p["rendimentos"]) for p in projects), Decimal("0.00"))
    total_cost = sum((_d(p["gastos"]) for p in projects), Decimal("0.00"))
    unassigned = next((p for p in projects if p["sem_projeto"]), None)

    return {
        "inicio": start,
        "fim": end,
        "projetos": projects,
        "totais": {
            "rendimentos": float(total_revenue),
            "gastos": float(total_cost),
            "margem": float(total_revenue - total_cost),
            "margem_pct": _pct(total_revenue - total_cost, total_revenue),
            "documentos": sum(p["documentos"] for p in projects),
        },
        "nao_atribuido": {
            "rendimentos": unassigned["rendimentos"] if unassigned else 0.0,
            "gastos": unassigned["gastos"] if unassigned else 0.0,
            "documentos": unassigned["documentos"] if unassigned else 0,
            "peso_pct": _pct(
                _d(unassigned["rendimentos"]) + _d(unassigned["gastos"]) if unassigned
                else Decimal("0.00"),
                total_revenue + total_cost,
            ),
        },
        "base": (
            "Regime de acréscimo, valores sem IVA — a mesma base da "
            "Demonstração de Resultados."
        ),
        "mensagem": _message(projects, unassigned),
    }


def _message(projects: list, unassigned: Optional[dict]) -> str:
    real = [p for p in projects if not p["sem_projeto"]]
    if not real:
        return (
            "Nenhum documento está atribuído a um projeto. Crie projetos e "
            "indique-os nos lançamentos para saber a margem de cada trabalho."
        )

    losing = [p for p in real if p["margem"] < 0]
    parts = []
    if losing:
        worst = losing[0]
        parts.append(
            f"{len(losing)} projeto(s) a perder dinheiro. O pior é "
            f"{worst['projeto']}: {worst['margem']:,.2f} €."
        )
    else:
        best = max(real, key=lambda p: p["margem"])
        parts.append(
            f"Todos os projetos com margem positiva. O melhor é "
            f"{best['projeto']}: {best['margem']:,.2f} €."
        )

    over = [p for p in real if p["acima_do_orcamento"]]
    if over:
        parts.append(
            f"{len(over)} passou o orçamento previsto."
        )
    if unassigned and unassigned["documentos"]:
        parts.append(
            f"Há {unassigned['documentos']} documento(s) sem projeto — essa parte "
            "do negócio fica de fora desta análise."
        )
    return " ".join(parts)


def statement(db: Session, company_id: str, centre_id: str,
              start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """One project, document by document — where its money went."""
    centre = scoped(db, company_id, centre_id)

    query = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.cost_center_id == centre_id,
            Transaction.status.notin_(financials.EXCLUDED_STATUSES),
        )
    )
    if start:
        query = query.filter(Transaction.date >= start)
    if end:
        query = query.filter(Transaction.date < end)
    rows = query.order_by(Transaction.date).all()
    nets = financials.line_net_totals(db, company_id, [t.id for t in rows])

    movements = []
    revenue = cost = Decimal("0.00")
    for trx in rows:
        amount = financials.net_of(trx, nets)
        if trx.type == "income":
            revenue += amount
        elif trx.type == "expense":
            cost += amount
        movements.append({
            "id": trx.id,
            "data": trx.date,
            "tipo": trx.type,
            "descricao": trx.description,
            "entidade": trx.entity_name,
            "categoria": trx.category_name,
            "documento": trx.document_number,
            "valor": float(amount),
            "estado": trx.payment_status,
        })

    margin = (revenue - cost).quantize(CENTS, rounding=ROUND_HALF_UP)
    budget = _d(centre.budget) if centre.budget is not None else None

    return {
        "projeto": serialize(centre),
        "movimentos": movements,
        "rendimentos": float(revenue),
        "gastos": float(cost),
        "margem": float(margin),
        "margem_pct": _pct(margin, revenue),
        "orcamento_usado_pct": _pct(cost, budget) if budget and budget > 0 else None,
        "acima_do_orcamento": bool(budget and budget > 0 and cost > budget),
        "base": "Regime de acréscimo, valores sem IVA.",
    }
