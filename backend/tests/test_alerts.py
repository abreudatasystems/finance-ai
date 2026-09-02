"""Alerts: computed from live state, so they cannot outlive the problem."""

import pytest

from app.db.session import SessionLocal
from app.models.models import AIApprovalItem, BankStatement, BankStatementEntry

TODAY = "2026-09-15"


def _alerts(tenant, today=TODAY):
    response = tenant.get(f"/api/v1/alerts/?today={today}")
    assert response.status_code == 200, response.text
    return response.json()


def _kinds(payload) -> set:
    return {alert["kind"] for alert in payload["alertas"]}


def test_a_clean_company_has_nothing_to_report(tenant):
    payload = _alerts(tenant)
    assert payload["resumo"]["tudo_em_dia"] is True
    assert payload["alertas"] == []


def test_an_overdue_bill_is_critical(tenant):
    tenant.book("expense", 615.00, date="2026-08-01", due_date="2026-08-20",
                description="Renda de agosto")
    payload = _alerts(tenant)
    alert = next(a for a in payload["alertas"] if a["kind"] == "contas_vencidas")
    assert alert["severity"] == "danger"
    assert alert["amount"] == 615.0
    assert alert["action"] == "/financial/payables"
    assert alert["items"][0]["due_date"] == "2026-08-20"


def test_paying_the_bill_removes_the_alert(tenant):
    trx = tenant.book("expense", 615.00, date="2026-08-01", due_date="2026-08-20")
    assert "contas_vencidas" in _kinds(_alerts(tenant))

    tenant.post(f"/api/v1/transactions/{trx['id']}/payments",
                {"amount": 615.00, "payment_date": "2026-09-01"})
    assert "contas_vencidas" not in _kinds(_alerts(tenant))


def test_a_bill_due_next_week_is_a_warning_not_a_crisis(tenant):
    tenant.book("expense", 200.00, date="2026-09-01", due_date="2026-09-18")
    alert = next(a for a in _alerts(tenant)["alertas"] if a["kind"] == "contas_a_vencer")
    assert alert["severity"] == "warning"
    assert alert["amount"] == 200.0


def test_money_that_should_have_come_in_is_flagged(tenant):
    tenant.book("income", 1000.00, date="2026-08-01", due_date="2026-08-30",
                category=tenant.category("income"), description="Fatura ao cliente")
    alert = next(a for a in _alerts(tenant)["alertas"] if a["kind"] == "recebimentos_vencidos")
    assert alert["severity"] == "danger"
    assert alert["amount"] == 1000.0


def test_documents_waiting_for_approval_are_flagged(tenant):
    db = SessionLocal()
    db.add(AIApprovalItem(
        id=f"APRA-{tenant.company_id[-8:]}", company_id=tenant.company_id,
        document_id="DOCX", document_name="fatura.pdf", supplier_name="EDP",
        amount=123.00, date="2026-09-01", suggested_category="Eletricidade",
        suggested_category_id="CAT-X", ai_confidence=60, status="pending",
    ))
    db.commit()
    db.close()

    alert = next(a for a in _alerts(tenant)["alertas"] if a["kind"] == "aprovacoes_pendentes")
    assert alert["count"] == 1
    assert "confiança baixa" in alert["description"]


def test_bank_lines_left_unreconciled_are_flagged(tenant):
    db = SessionLocal()
    prefix = tenant.company_id[-8:]
    db.add(BankStatement(id=f"STA-{prefix}", company_id=tenant.company_id,
                         bank_name="CGD", file_name="e.csv", status="completed"))
    db.add(BankStatementEntry(id=f"EA-{prefix}", statement_id=f"STA-{prefix}",
                              company_id=tenant.company_id, date="2026-08-01",
                              description="TRF ANTIGA", amount=250.00, type="debit"))
    db.commit()
    db.close()

    alert = next(a for a in _alerts(tenant)["alertas"] if a["kind"] == "conciliacao_atrasada")
    assert alert["amount"] == 250.0


def test_a_recurrence_with_periods_not_generated_is_flagged(tenant):
    category = tenant.category("expense")
    tenant.post("/api/v1/recurrences/", {
        "name": "Renda", "description": "Renda mensal", "amount": 500.0,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "monthly", "day_of_month": 1, "start_date": "2026-07-01",
    })
    alert = next(a for a in _alerts(tenant)["alertas"] if a["kind"] == "recorrencias_em_falta")
    assert alert["count"] == 3, "julho, agosto e setembro por gerar"
    assert alert["action"] == "/financial/recurrences"


def test_generating_them_clears_the_alert(tenant):
    category = tenant.category("expense")
    tenant.post("/api/v1/recurrences/", {
        "name": "Renda", "description": "Renda mensal", "amount": 500.0,
        "category_id": category["id"], "category_name": category["name"],
        "frequency": "monthly", "day_of_month": 1, "start_date": "2026-07-01",
    })
    tenant.post("/api/v1/recurrences/run", {"until": TODAY})
    assert "recorrencias_em_falta" not in _kinds(_alerts(tenant))


def test_the_vat_deadline_warns_before_it_passes(tenant):
    """Q2 VAT is payable by 25 August; on 20 August that is a warning."""
    tenant.book("income", 1230.00, date="2026-05-10", paid=True,
                category=tenant.category("income"), description="Venda do 2.º trimestre")
    payload = _alerts(tenant, today="2026-08-20")
    alert = next(a for a in payload["alertas"] if a["kind"] == "iva_a_pagar")
    assert alert["amount"] == 230.0
    assert alert["action"] == "/fiscal/vat"


def test_the_vat_deadline_becomes_critical_once_it_passes(tenant):
    tenant.book("income", 1230.00, date="2026-05-10", paid=True,
                category=tenant.category("income"), description="Venda do 2.º trimestre")
    payload = _alerts(tenant, today="2026-08-28")
    alert = next(a for a in payload["alertas"] if a["kind"] == "iva_em_atraso")
    assert alert["severity"] == "danger"


def test_alerts_are_ordered_worst_first(tenant):
    tenant.book("expense", 615.00, date="2026-08-01", due_date="2026-08-20")
    tenant.book("expense", 200.00, date="2026-09-01", due_date="2026-09-18")
    severities = [a["severity"] for a in _alerts(tenant)["alertas"]]
    assert severities == sorted(severities, key=lambda s: {"danger": 0, "warning": 1, "info": 2}[s])


def test_an_invalid_date_is_refused(tenant):
    assert tenant.get("/api/v1/alerts/?today=ontem").status_code == 400


def test_alerts_never_leak_between_companies(tenant, other_tenant):
    tenant.book("expense", 615.00, date="2026-08-01", due_date="2026-08-20")
    assert _alerts(other_tenant)["resumo"]["tudo_em_dia"] is True
