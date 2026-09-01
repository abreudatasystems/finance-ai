"""The human gate: what the AI read becomes an obligation only when someone says so."""

import json
from datetime import datetime

import pytest

from app.db.session import SessionLocal
from app.models.models import AIApprovalItem, AIDocument, AIExtraction


@pytest.fixture
def scanned(tenant):
    """A document read by the engine, waiting for a decision."""
    db = SessionLocal()
    prefix = tenant.company_id[-8:]
    doc_id, ext_id = f"DOC-{prefix}", f"EXT-{prefix}"
    db.add(AIDocument(
        id=doc_id, company_id=tenant.company_id, file_name="ft-2026-452.pdf",
        file_url="/files/ft.pdf", status="needs_review", document_number="FT 2026/00452",
        document_type="invoice", file_type="application/pdf", channel="email",
    ))
    db.add(AIExtraction(
        id=ext_id, company_id=tenant.company_id, document_id=doc_id, supplier="EDP Comercial",
        nif="503504564", document_number="FT 2026/00452", document_date="2026-08-20",
        due_date="2026-09-20", net_amount=100, vat_rate=23, vat_amount=23, gross_amount=123,
        confidence=0.72, validation_status="needs_review",
        validation_report=json.dumps([
            {"check": "NIF válido", "ok": True},
            {"check": "Total = base + IVA", "ok": True},
        ]),
        ai_model="ocr-local", processed_at=datetime.utcnow(),
    ))
    for index, (supplier, amount, confidence) in enumerate(
        [("EDP Comercial", 123, 72), ("Vodafone", 61.5, 96)], start=1
    ):
        db.add(AIApprovalItem(
            id=f"APR-{prefix}-{index}", company_id=tenant.company_id, document_id=doc_id,
            document_name="ft-2026-452.pdf", extraction_id=ext_id, supplier_name=supplier,
            amount=amount, net_amount=amount / 1.23, vat_rate=23, vat=amount - amount / 1.23,
            date="2026-08-20", due_date="2026-09-20", document_number="FT 2026/00452",
            document_type="invoice", suggested_category="Eletricidade e Água",
            suggested_category_id="CAT-X", ai_confidence=confidence, status="pending",
            created_at=datetime.utcnow(),
        ))
    db.commit()
    db.close()
    return {"document_id": doc_id, "first": f"APR-{prefix}-1", "second": f"APR-{prefix}-2"}


def test_queue_carries_the_document_with_each_item(tenant, scanned):
    rows = tenant.get("/api/v1/approvals/").json()
    assert len(rows) == 2
    assert all(row["file_url"] for row in rows)


def test_low_confidence_is_flagged(tenant, scanned):
    summary = tenant.get("/api/v1/approvals/summary").json()
    assert summary["pendentes"] == 2
    assert summary["por_rever"] == 1


def test_inspector_returns_the_extraction_and_its_checks(tenant, scanned):
    detail = tenant.get(f"/api/v1/approvals/{scanned['first']}").json()
    assert detail["extraction"]["nif"] == "503504564"
    assert len(detail["validation"]) == 2


def test_approving_creates_an_obligation_not_a_payment(tenant, scanned):
    result = tenant.post(f"/api/v1/approvals/{scanned['first']}/action?action=approved", {}).json()
    assert result["payment_status"] == "pending"

    trx = tenant.get(f"/api/v1/transactions/{result['transaction_id']}").json()
    assert float(trx["paid_amount"]) == 0
    assert trx["status"] == "approved"


def test_correcting_only_the_total_recomputes_the_vat(tenant, scanned):
    """130 € at 23% is 105,69 + 24,31 — never the extracted 100 + 30."""
    result = tenant.post(f"/api/v1/approvals/{scanned['first']}/action?action=edited",
                         {"amount": 130.0, "vat_rate": 23}).json()
    trx = tenant.get(f"/api/v1/transactions/{result['transaction_id']}").json()
    assert float(trx["net_amount"]) == 105.69
    assert float(trx["vat_amount"]) == 24.31
    assert float(trx["net_amount"]) + float(trx["vat_amount"]) == float(trx["amount"])


def test_an_item_cannot_be_decided_twice(tenant, scanned):
    tenant.post(f"/api/v1/approvals/{scanned['first']}/action?action=approved", {})
    again = tenant.post(f"/api/v1/approvals/{scanned['first']}/action?action=approved", {})
    assert again.status_code == 409


def test_a_batch_reports_each_outcome_separately(tenant, scanned):
    result = tenant.post("/api/v1/approvals/batch", {
        "approval_ids": [scanned["second"], "NAO-EXISTE"], "action": "approved",
    }).json()
    assert result["decididos"] == 1
    assert result["falhados"] == 1


def test_decisions_are_written_to_the_audit_trail(tenant, scanned):
    tenant.post(f"/api/v1/approvals/{scanned['first']}/action?action=approved", {})
    logs = tenant.get("/api/v1/audit/").json()
    assert any(log["module"] == "Aprovações" for log in logs)


def test_approvals_are_invisible_to_another_company(tenant, other_tenant, scanned):
    assert other_tenant.get(f"/api/v1/approvals/{scanned['first']}").status_code == 404
    assert other_tenant.get("/api/v1/approvals/").json() == []
