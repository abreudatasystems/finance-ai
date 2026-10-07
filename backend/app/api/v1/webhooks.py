import hmac

import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from app.db.session import get_db
from app.core.config import settings
from app.models.models import AIDocument, AuditLog, Company, Company

router = APIRouter()


def verify_webhook_secret(x_webhook_secret: Optional[str] = Header(default=None)):
    """Machine-to-machine endpoints are guarded by a shared secret.

    Sem WEBHOOK_SECRET configurado os webhooks ficam fechados: antes, um
    segredo vazio desligava a verificação e qualquer pessoa na Internet podia
    pôr documentos na caixa de qualquer empresa.
    """
    if not settings.WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhooks desactivados: defina WEBHOOK_SECRET.")
    if not x_webhook_secret or not hmac.compare_digest(
        x_webhook_secret.encode(), settings.WEBHOOK_SECRET.encode()
    ):
        raise HTTPException(status_code=401, detail="Assinatura de webhook inválida")


def _company(db: Session, data: dict) -> str:
    company_id = data.get("company_id")
    if not company_id or not db.query(Company.id).filter(Company.id == company_id).first():
        raise HTTPException(status_code=404, detail="Empresa desconhecida")
    return company_id


def _now():
    return datetime.now(timezone.utc)


def _ingest(db: Session, *, company_id: str, channel: str, file_name: str,
            supplier: Optional[str], prefix: str, audit_user: str, audit_desc: str):
    """Regista o documento recebido, e só isso.

    Antes, cada email entrava como uma fatura de 450 € de "Marketing" e cada
    WhatsApp como um recibo de 65 € da Galp, com 95% de confiança — valores
    inventados. O documento fica "recebido", sem valores, à espera de leitura.
    """
    now = _now()
    doc_id = f"{prefix}-{int(now.timestamp() * 1000)}"
    doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        file_name=file_name,
        channel=channel,
        status="uploaded",
        upload_date=now.strftime("%Y-%m-%d %H:%M"),
        extracted_supplier=supplier,
        ai_confidence=0,  # nada foi lido ainda
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
    sender_email = data.get("sender") or "remetente desconhecido"
    attachment_name = data.get("filename", "fatura_email.pdf")
    company_id = _company(db, data)

    doc_id = _ingest(
        db,
        company_id=company_id,
        channel="email",
        file_name=attachment_name,
        supplier=None,
        prefix="DOC-EML",
        audit_user="Email Webhook Engine",
        audit_desc=f"Recebida fatura por Email de {sender_email}",
    )
    return {"status": "success", "document_id": doc_id, "channel": "email"}


@router.post("/whatsapp", dependencies=[Depends(verify_webhook_secret)])
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    phone_number = data.get("phone") or "número desconhecido"
    media_url = data.get("media_url", "recibo_whatsapp.jpg")
    company_id = _company(db, data)

    doc_id = _ingest(
        db,
        company_id=company_id,
        channel="whatsapp",
        file_name=media_url,
        supplier=None,
        prefix="DOC-WAP",
        audit_user="WhatsApp Webhook Engine",
        audit_desc=f"Recebido recibo via WhatsApp de {phone_number}",
    )
    return {"status": "success", "document_id": doc_id, "channel": "whatsapp"}
