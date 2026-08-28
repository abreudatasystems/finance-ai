from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.session import get_db
from app.models.models import AIDocument, AuditLog

router = APIRouter()

@router.post("/email")
async def email_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    sender_email = data.get("sender", "faturas@fornecedor.pt")
    subject = data.get("subject", "Fatura em Anexo")
    attachment_name = data.get("filename", "fatura_email.pdf")
    company_id = data.get("company_id", "COMP001")
    
    doc_id = f"DOC-EML-{int(datetime.utcnow().timestamp())}"
    doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        filename=attachment_name,
        source="email",
        status="parsed",
        upload_date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        extracted_supplier=sender_email.split("@")[0].capitalize(),
        extracted_amount=450.0,
        extracted_vat=103.5,
        extracted_category="Marketing",
        extracted_due_date=datetime.utcnow().strftime("%Y-%m-%d"),
        ai_confidence=95,
        file_path=f"email_attachments/{attachment_name}"
    )
    db.add(doc)
    
    audit = AuditLog(
        id=f"AUD-EML-{int(datetime.utcnow().timestamp())}",
        company_id=company_id,
        timestamp=datetime.utcnow().isoformat(),
        user="Email Webhook Engine",
        action="Documento Recebido",
        module="Finance Inbox",
        description=f"Recebida fatura por Email de {sender_email}",
        entity_id=doc_id
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "document_id": doc_id, "channel": "email"}

@router.post("/whatsapp")
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    phone_number = data.get("phone", "+351912345678")
    media_url = data.get("media_url", "recibo_whatsapp.jpg")
    company_id = data.get("company_id", "COMP001")
    
    doc_id = f"DOC-WAP-{int(datetime.utcnow().timestamp())}"
    doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        filename="recibo_whatsapp.jpg",
        source="whatsapp",
        status="parsed",
        upload_date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        extracted_supplier="Combustíveis Galp",
        extracted_amount=65.0,
        extracted_vat=14.95,
        extracted_category="Transporte & Viagens",
        extracted_due_date=datetime.utcnow().strftime("%Y-%m-%d"),
        ai_confidence=92,
        file_path=f"whatsapp_media/{media_url}"
    )
    db.add(doc)
    
    audit = AuditLog(
        id=f"AUD-WAP-{int(datetime.utcnow().timestamp())}",
        company_id=company_id,
        timestamp=datetime.utcnow().isoformat(),
        user="WhatsApp Webhook Engine",
        action="Documento Recebido",
        module="Finance Inbox",
        description=f"Recebido recibo via WhatsApp de {phone_number}",
        entity_id=doc_id
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "document_id": doc_id, "channel": "whatsapp"}
