import json
import os
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.core import uploads
from app.db.session import get_db
from app.models.models import (
    AIApprovalItem,
    AIDocument,
    AIExtraction,
    AuditLog,
    Category,
    Supplier,
    User,
)
from app.services.storage import document_storage, object_key
from app.services.open_source_ocr import (
    AI_MODEL,
    AI_VERSION,
    compute_hash,
    engine_status,
    process_document,
    suggest_category,
)

router = APIRouter()


def _stamp() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


@router.get("/")
def get_documents(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return (
        db.query(AIDocument)
        .filter(AIDocument.company_id == company_id)
        .order_by(AIDocument.upload_date.desc())
        .all()
    )


@router.get("/capabilities")
def reading_capabilities():
    """O que esta instalação consegue mesmo ler.

    Sem o motor de OCR instalado, uma fotografia de um recibo é aceite,
    processada e devolve 0% de confiança sem dizer porquê. Isto permite que o
    produto o diga à frente — e que quem instala saiba o que lhe falta.
    """
    return engine_status()


@router.get("/{doc_id}")
def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    doc = (
        db.query(AIDocument)
        .filter(AIDocument.id == doc_id, AIDocument.company_id == company_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    extraction = (
        db.query(AIExtraction)
        .filter(AIExtraction.document_id == doc_id, AIExtraction.company_id == company_id)
        .order_by(AIExtraction.processed_at.desc())
        .first()
    )
    approval = (
        db.query(AIApprovalItem)
        .filter(AIApprovalItem.document_id == doc_id, AIApprovalItem.company_id == company_id)
        .first()
    )
    return {
        "document": doc,
        "extraction": extraction,
        "validation": json.loads(extraction.validation_report) if extraction and extraction.validation_report else [],
        "approval_id": approval.id if approval else None,
        "approval_status": approval.status if approval else None,
    }


#: O tipo com que se devolve cada ficheiro. Nunca se devolve o que o
#: utilizador disse que era: um HTML servido como HTML executa no browser.
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


@router.get("/{doc_id}/file")
def get_document_file(
    doc_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """O ficheiro original de um documento desta empresa.

    Servia-se por nome de ficheiro, sem autenticação nenhuma: quem soubesse —
    ou adivinhasse — um nome descarregava a fatura, e os nomes são os que o
    utilizador deu. Passa a ser pelo id do documento, que é o que o torna
    verificável contra a empresa activa.
    """
    document = (
        db.query(AIDocument)
        .filter(AIDocument.id == doc_id, AIDocument.company_id == company_id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    key = object_key(document.company_id, document.file_hash or "", document.file_name)
    data = document_storage.get(key, legacy_name=document.file_name)
    if data is None:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado no armazenamento")

    suffix = os.path.splitext((document.file_name or "").lower())[1]
    name = os.path.basename(document.file_name or "documento")
    return Response(
        content=data,
        media_type=MEDIA_TYPES.get(suffix, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    channel: str = Form("upload"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Ingest a document: store it, extract its data, and queue it for approval.

    This never creates a transaction directly — an approved item becomes an
    obligation only after a human decides, in the approvals module.
    """
    file_bytes = await file.read()
    # What the bytes are, not what the name or the browser claims they are.
    try:
        detected_type = uploads.validate(file_bytes, file.filename or "")
    except uploads.UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    file_hash = compute_hash(file_bytes)

    # --- Duplicate detection: the same file must not be ingested twice ---
    duplicate = (
        db.query(AIDocument)
        .filter(AIDocument.company_id == company_id, AIDocument.file_hash == file_hash)
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Documento duplicado — este ficheiro já foi carregado.",
                "existing_document_id": duplicate.id,
                "existing_file_name": duplicate.file_name,
            },
        )


    # --- Extract structured data from the document itself ---
    parsed, raw_text = await process_document(file_bytes, file.filename)

    categories = db.query(Category).filter(Category.company_id == company_id).all()
    cat_id, cat_name = suggest_category(parsed, categories)

    # Match the supplier against the company's own registry when possible.
    entity_id = None
    if parsed.nif:
        supplier = (
            db.query(Supplier)
            .filter(Supplier.company_id == company_id, Supplier.nif == parsed.nif)
            .first()
        )
        if supplier:
            entity_id = supplier.id
            if not cat_id and supplier.default_category_id:
                cat_id, cat_name = supplier.default_category_id, supplier.default_category_name

    now = datetime.now(timezone.utc)
    stamp = _stamp()
    doc_id = f"DOC-{stamp}"

    # A chave leva a empresa e o hash do conteúdo. Era o nome que o utilizador
    # deu, sem mais nada: duas empresas com uma "fatura.pdf" escreviam a mesma
    # chave e a segunda apagava a primeira.
    document_storage.put(object_key(company_id, file_hash, file.filename),
                         file_bytes, detected_type)
    file_url = f"/api/v1/documents/{doc_id}/file"

    doc_status = "needs_review" if parsed.validation_status != "valid" else "extracted"
    if parsed.validation_status == "failed":
        doc_status = "needs_review"

    new_doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        file_name=file.filename,
        file_size=f"{round(len(file_bytes) / 1024, 1)} KB",
        file_type=file.content_type or "application/pdf",
        channel=channel,
        status=doc_status,
        upload_date=now.isoformat(),
        file_url=file_url,
        file_hash=file_hash,
        document_number=parsed.document_number,
        document_type=parsed.document_type,
        document_date=parsed.document_date,
        extracted_supplier=parsed.supplier,
        extracted_nif=parsed.nif,
        extracted_amount=parsed.gross_amount,
        extracted_net=parsed.net_amount,
        extracted_vat=parsed.vat_amount,
        extracted_vat_rate=parsed.vat_rate,
        extracted_date=parsed.document_date,
        extracted_due_date=parsed.due_date,
        suggested_category=cat_name,
        suggested_category_id=cat_id,
        ai_confidence=int(round(parsed.confidence * 100)),
        uploaded_by=current_user.name,
    )
    db.add(new_doc)

    extraction = AIExtraction(
        id=f"EXT-{stamp}",
        company_id=company_id,
        document_id=doc_id,
        supplier=parsed.supplier,
        nif=parsed.nif,
        document_number=parsed.document_number,
        document_date=parsed.document_date,
        due_date=parsed.due_date,
        net_amount=parsed.net_amount,
        vat_rate=parsed.vat_rate,
        vat_amount=parsed.vat_amount,
        gross_amount=parsed.gross_amount,
        currency=parsed.currency,
        suggested_category=cat_name,
        suggested_category_id=cat_id,
        confidence=parsed.confidence,
        validation_status=parsed.validation_status,
        validation_report=json.dumps(parsed.checks, ensure_ascii=False),
        ai_model=AI_MODEL,
        ai_version=AI_VERSION,
        raw_result=json.dumps({"raw_text": raw_text, "parsed": parsed.as_dict()}, ensure_ascii=False),
        processed_at=now,
    )
    db.add(extraction)

    # --- Queue for human approval (the missing link) ---
    approval_id = None
    if parsed.gross_amount and parsed.gross_amount > 0:
        approval_id = f"APP-{stamp}"
        db.add(AIApprovalItem(
            id=approval_id,
            company_id=company_id,
            document_id=doc_id,
            document_name=file.filename,
            extraction_id=extraction.id,
            supplier_name=parsed.supplier or "Fornecedor por identificar",
            entity_id=entity_id,
            amount=parsed.gross_amount,
            net_amount=parsed.net_amount,
            vat_rate=parsed.vat_rate,
            vat=parsed.vat_amount or Decimal("0.00"),
            date=parsed.document_date or now.strftime("%Y-%m-%d"),
            due_date=parsed.due_date,
            document_number=parsed.document_number,
            document_type=parsed.document_type,
            suggested_category=cat_name or "Por classificar",
            suggested_category_id=cat_id or "",
            ai_confidence=int(round(parsed.confidence * 100)),
            status="pending",
        ))

    db.add(AuditLog(
        id=f"AUD-DOC-{stamp}",
        company_id=company_id,
        timestamp=now.isoformat(),
        user=current_user.name,
        action="Documento Processado",
        module="Finance Inbox",
        description=(
            f"{file.filename}: extração {parsed.validation_status} "
            f"({int(round(parsed.confidence * 100))}% confiança)"
            + (" — enviado para aprovação" if approval_id else " — sem valor legível, requer revisão")
        ),
        entity_id=doc_id,
    ))

    db.commit()
    db.refresh(new_doc)

    return {
        "document": new_doc,
        "extraction_id": extraction.id,
        "approval_id": approval_id,
        "confidence": parsed.confidence,
        "validation_status": parsed.validation_status,
        "validation": parsed.checks,
    }
