from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from app.db.session import get_db
from app.core.config import settings
from app.models.models import AIDocument, AuditLog

router = APIRouter()


def verify_webhook_secret(x_webhook_secret: Optional[str] = Header(default=None)):
    """Machine-to-machine endpoints are guarded by a shared secret.

    When WEBHOOK_SECRET is unset (local dev) the check is skipped; in any
    deployment it must be configured so third parties cannot inject documents.
    """
    if settings.WEBHOOK_SECRET and x_webhook_secret != settings.WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Assinatura de webhook inválida")


def _now():
    return datetime.now(timezone.utc)


def _ingest(db: Session, *, company_id: str, channel: str, file_name: str,
            supplier: str, amount: float, vat: float, category: str,
            confidence: int, prefix: str, audit_user: str, audit_desc: str):
    now = _now()
    doc_id = f"{prefix}-{int(now.timestamp() * 1000)}"
    doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        file_name=file_name,
        channel=channel,
        status="processed",
        upload_date=now.strftime("%Y-%m-%d %H:%M"),
        extracted_supplier=supplier,
        extracted_amount=amount,
        extracted_vat=vat,
        extracted_date=now.strftime("%Y-%m-%d"),
        suggested_category=category,
        ai_confidence=confidence,
    )
    db.add(doc)
    db.add(AuditLog(
        id=f"AUD-{prefix}-{int(now.timestamp() * 1000)}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=audit_user,
        action="Documento Recebido",
        module="Finance Inbox",
        description=audit_desc,
        entity_id=doc_id,
    ))
    db.commit()
    return doc_id


@router.post("/email", dependencies=[Depends(verify_webhook_secret)])
async def email_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    sender_email = data.get("sender", "faturas@fornecedor.pt")
    attachment_name = data.get("filename", "fatura_email.pdf")
    company_id = data.get("company_id", "COMP001")

    doc_id = _ingest(
        db,
        company_id=company_id,
        channel="email",
        file_name=attachment_name,
        supplier=sender_email.split("@")[0].capitalize(),
        amount=450.0,
        vat=103.5,
        category="Marketing",
        confidence=95,
        prefix="DOC-EML",
        audit_user="Email Webhook Engine",
        audit_desc=f"Recebida fatura por Email de {sender_email}",
    )
    return {"status": "success", "document_id": doc_id, "channel": "email"}


@router.post("/whatsapp", dependencies=[Depends(verify_webhook_secret)])
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    phone_number = data.get("phone", "+351912345678")
    media_url = data.get("media_url", "recibo_whatsapp.jpg")
    company_id = data.get("company_id", "COMP001")

    doc_id = _ingest(
        db,
        company_id=company_id,
        channel="whatsapp",
        file_name=media_url,
        supplier="Combustíveis Galp",
        amount=65.0,
        vat=14.95,
        category="Transporte & Viagens",
        confidence=92,
        prefix="DOC-WAP",
        audit_user="WhatsApp Webhook Engine",
        audit_desc=f"Recebido recibo via WhatsApp de {phone_number}",
    )
    return {"status": "success", "document_id": doc_id, "channel": "whatsapp"}
