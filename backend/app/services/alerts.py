"""Alerts — the few things worth interrupting someone for.

Everything here is computed from live state on every request. Nothing is
stored, so an alert cannot outlive the problem it describes: pay the invoice
and the warning is gone on the next read, with nobody having to remember to
clear a flag.

Each alert says what happened, how much is at stake and where to go — a
warning that does not name an amount or a next step is decoration.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import (
    AIApprovalItem, BankStatementEntry, Company, Payment, Recurrence, Transaction,
)
from app.services import recurrences as recurrence_service
from app.services.vat_engine import compute_vat_position, resolve_period

CENTS = Decimal("0.01")

#: How far ahead "coming up" reaches.
DUE_SOON_DAYS = 7
#: A bank line older than this and still unreconciled is worth flagging.
STALE_RECONCILIATION_DAYS = 15
#: The VAT payment deadline starts warning this many days out.
VAT_WARNING_DAYS = 10

SEVERITY_ORDER = {"danger": 0, "warning": 1, "info": 2}


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _alert(kind: str, severity: str, title: str, description: str, *,
           count: int = 0, amount: float = 0.0, action: Optional[str] = None,
           action_label: Optional[str] = None, items: Optional[list] = None) -> dict:
    return {
        "kind": kind,
        "severity": severity,          # danger | warning | info
        "title": title,
        "description": description,
        "count": count,
        "amount": amount,
        "action": action,
        "action_label": action_label,
        "items": items or [],
    }


def _open_transactions(db: Session, company_id: str, kind: str) -> list[Transaction]:
    return (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == kind,
            Transaction.status.notin_(["cancelled", "draft"]),
            Transaction.payment_status.in_(["pending", "partially_paid", "overdue"]),
        )
        .all()
    )


def _brief(rows: list[Transaction], limit: int = 5) -> list[dict]:
    return [
        {
            "id": t.id,
            "description": t.description,
            "entity_name": t.entity_name,
            "due_date": t.due_date,
            "outstanding": float(_d(t.outstanding_amount)),
        }
        for t in rows[:limit]
    ]


# --------------------------------------------------------------------------
# The checks
# --------------------------------------------------------------------------

def overdue_payables(db: Session, company_id: str, today: date) -> Optional[dict]:
    rows = [t for t in _open_transactions(db, company_id, "expense")
            if t.due_date and t.due_date < today.isoformat()]
    if not rows:
        return None
    rows.sort(key=lambda t: t.due_date)
    total = sum((_d(t.outstanding_amount) for t in rows), Decimal("0.00"))
    return _alert(
        "contas_vencidas", "danger",
        f"{len(rows)} conta(s) por pagar já vencida(s)",
        f"Estão {total} € por liquidar com o prazo ultrapassado. A mais antiga venceu a {rows[0].due_date}.",
        count=len(rows), amount=float(total),
        action="/financial/payables", action_label="Ver contas a pagar",
        items=_brief(rows),
    )


def payables_due_soon(db: Session, company_id: str, today: date) -> Optional[dict]:
    horizon = (today + timedelta(days=DUE_SOON_DAYS)).isoformat()
    rows = [t for t in _open_transactions(db, company_id, "expense")
            if t.due_date and today.isoformat() <= t.due_date <= horizon]
    if not rows:
        return None
    rows.sort(key=lambda t: t.due_date)
    total = sum((_d(t.outstanding_amount) for t in rows), Decimal("0.00"))
    return _alert(
        "contas_a_vencer", "warning",
        f"{len(rows)} conta(s) a vencer nos próximos {DUE_SOON_DAYS} dias",
        f"{total} € a pagar até {horizon}.",
        count=len(rows), amount=float(total),
        action="/financial/payables", action_label="Ver contas a pagar",
        items=_brief(rows),
    )


def overdue_receivables(db: Session, company_id: str, today: date) -> Optional[dict]:
    rows = [t for t in _open_transactions(db, company_id, "income")
            if t.due_date and t.due_date < today.isoformat()]
    if not rows:
        return None
    rows.sort(key=lambda t: t.due_date)
    total = sum((_d(t.outstanding_amount) for t in rows), Decimal("0.00"))
    return _alert(
        "recebimentos_vencidos", "danger",
        f"{len(rows)} recebimento(s) em atraso",
        f"{total} € que já deviam ter entrado. O mais antigo venceu a {rows[0].due_date}.",
        count=len(rows), amount=float(total),
        action="/financial/receivables", action_label="Ver contas a receber",
        items=_brief(rows),
    )


def vat_deadline(db: Session, company_id: str, today: date) -> Optional[dict]:
    """The VAT of the last closed period, and how long is left to pay it."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company or (company.vat_regime or "normal") != "normal":
        return None

    periodicity = company.vat_periodicity or "quarterly"
    # The period that has closed: step back one from the one open today.
    _, _, start, _ = resolve_period(periodicity, None, today)
    previous_end = date.fromisoformat(start) - timedelta(days=1)
    _, key, _, _ = resolve_period(periodicity, None, previous_end)

    position = compute_vat_position(db, company_id, key, today)
    due = position["apuramento"]["a_entregar"]
    if due <= 0:
        return None

    deadline = date.fromisoformat(position["prazos"]["pagamento_ate"])
    days_left = (deadline - today).days
    if days_left > VAT_WARNING_DAYS:
        return None

    if days_left < 0:
        return _alert(
            "iva_em_atraso", "danger",
            f"IVA de {position['period']['label']} fora de prazo",
            f"{due} € deviam ter sido entregues até {deadline.isoformat()}.",
            amount=due, action="/fiscal/vat", action_label="Ver apuramento",
        )
    return _alert(
        "iva_a_pagar", "warning",
        f"IVA de {position['period']['label']} a pagar em {days_left} dia(s)",
        f"{due} € a entregar até {deadline.isoformat()}. Declaração até "
        f"{position['prazos']['declaracao_ate']}.",
        amount=due, action="/fiscal/vat", action_label="Ver apuramento",
    )


def pending_approvals(db: Session, company_id: str, today: date) -> Optional[dict]:
    rows = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.company_id == company_id, AIApprovalItem.status == "pending")
        .all()
    )
    if not rows:
        return None
    total = sum((_d(r.amount) for r in rows), Decimal("0.00"))
    low = [r for r in rows if (r.ai_confidence or 0) < 80]
    description = f"{total} € em documentos lidos pela IA à espera de decisão."
    if low:
        description += f" {len(low)} com confiança baixa."
    return _alert(
        "aprovacoes_pendentes", "warning",
        f"{len(rows)} documento(s) por aprovar",
        description,
        count=len(rows), amount=float(total),
        action="/documents/approvals", action_label="Rever agora",
    )


def stale_reconciliation(db: Session, company_id: str, today: date) -> Optional[dict]:
    cutoff = (today - timedelta(days=STALE_RECONCILIATION_DAYS)).isoformat()
    rows = (
        db.query(BankStatementEntry)
        .filter(
            BankStatementEntry.company_id == company_id,
            BankStatementEntry.status.in_(["unmatched", "suggested"]),
            BankStatementEntry.date < cutoff,
        )
        .all()
    )
    if not rows:
        return None
    total = sum((_d(r.amount).copy_abs() for r in rows), Decimal("0.00"))
    return _alert(
        "conciliacao_atrasada", "warning",
        f"{len(rows)} movimento(s) bancário(s) por conciliar há mais de {STALE_RECONCILIATION_DAYS} dias",
        f"{total} € de movimentos que ainda não foram ligados a nenhum lançamento.",
        count=len(rows), amount=float(total),
        action="/financial/bank-reconciliation", action_label="Conciliar",
    )


def recurrences_behind(db: Session, company_id: str, today: date) -> Optional[dict]:
    """Rules whose period has passed and that nobody generated."""
    pending = []
    for rec in (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id, Recurrence.active.isnot(False))
        .all()
    ):
        done = recurrence_service._existing_periods(db, rec.id)
        missing = [
            due for due in recurrence_service.occurrences_due(rec, today)
            if recurrence_service.period_key(rec.frequency, due) not in done
        ]
        if missing:
            pending.append({
                "recurrence_id": rec.id, "name": rec.name,
                "periodos": len(missing), "amount": float(_d(rec.amount)),
            })
    if not pending:
        return None
    total = sum(p["periodos"] * p["amount"] for p in pending)
    return _alert(
        "recorrencias_em_falta", "info",
        f"{len(pending)} recorrência(s) com períodos por lançar",
        f"{total} € em lançamentos que já venceram e ainda não foram gerados.",
        count=sum(p["periodos"] for p in pending), amount=total,
        action="/financial/recurrences", action_label="Gerar em falta",
        items=pending,
    )


def unclassified(db: Session, company_id: str, today: date) -> Optional[dict]:
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.status.notin_(["cancelled"]),
            (Transaction.category_id.is_(None)) | (Transaction.category_id == ""),
        )
        .all()
    )
    if not rows:
        return None
    return _alert(
        "por_classificar", "info",
        f"{len(rows)} lançamento(s) por classificar",
        "Sem categoria, não entram nos relatórios por rubrica nem no razão com conta SNC.",
        count=len(rows),
        amount=float(sum((_d(t.amount) for t in rows), Decimal("0.00"))),
        action="/financial/cash-flow", action_label="Ver fluxo de caixa",
        items=_brief(rows),
    )


def unreconciled_payments(db: Session, company_id: str, today: date) -> Optional[dict]:
    """Money we recorded as moved that the bank statement has not confirmed."""
    rows = (
        db.query(Payment)
        .filter(Payment.company_id == company_id, Payment.bank_entry_id.is_(None))
        .all()
    )
    old = [p for p in rows
           if p.payment_date and p.payment_date < (today - timedelta(days=STALE_RECONCILIATION_DAYS)).isoformat()]
    if not old:
        return None
    total = sum((_d(p.amount) for p in old), Decimal("0.00"))
    return _alert(
        "pagamentos_sem_extrato", "info",
        f"{len(old)} pagamento(s) sem confirmação no extrato",
        f"{total} € registados como movimentados mas ainda não encontrados no banco.",
        count=len(old), amount=float(total),
        action="/financial/bank-reconciliation", action_label="Conciliar",
    )


CHECKS = (
    overdue_payables,
    overdue_receivables,
    vat_deadline,
    payables_due_soon,
    pending_approvals,
    stale_reconciliation,
    recurrences_behind,
    unreconciled_payments,
    unclassified,
)


def collect(db: Session, company_id: str, today: Optional[date] = None) -> dict:
    """Run every check and return what is actually wrong, worst first."""
    today = today or date.today()
    alerts = []
    for check in CHECKS:
        result = check(db, company_id, today)
        if result:
            alerts.append(result)

    alerts.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 9), -a["amount"]))

    # No alerts on an empty company means nothing was checked, not that
    # everything is in order. Saying "tudo em dia" there is a lie the product
    # would be caught in the first time it mattered.
    from app.services.onboarding import readiness
    has_data = readiness(db, company_id)["alertas"]

    return {
        "data": today.isoformat(),
        "alertas": alerts,
        "resumo": {
            "total": len(alerts),
            "criticos": len([a for a in alerts if a["severity"] == "danger"]),
            "avisos": len([a for a in alerts if a["severity"] == "warning"]),
            "informativos": len([a for a in alerts if a["severity"] == "info"]),
            "tudo_em_dia": bool(has_data) and not alerts,
            "sem_dados": not has_data,
        },
    }
