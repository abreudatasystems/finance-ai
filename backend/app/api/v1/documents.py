import json
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_company_id, get_current_user, require_write
from app.core import uploads
from app.db.session import get_db
from app.models.models import AIApprovalItem, AIDocument, AIExtraction, User
from app.services import ingestion
from app.services.storage import document_storage, object_key
from app.services.open_source_ocr import engine_status

router = APIRouter()


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

    A ingestão em si vive em ``app.services.ingestion`` porque os webhooks
    entram pelo mesmo caminho. Aqui fica só o que é próprio de um carregamento
    feito por uma pessoa autenticada: quem é, e como se traduzem as recusas
    para HTTP.
    """
    file_bytes = await file.read()
    try:
        result = await ingestion.ingest(
            db,
            company_id=company_id,
            file_bytes=file_bytes,
            file_name=file.filename or "documento",
            channel=channel,
            actor=current_user.name,
        )
    except uploads.UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ingestion.DuplicateDocument as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Documento duplicado — este ficheiro já foi carregado.",
                "existing_document_id": exc.existing.id,
                "existing_file_name": exc.existing.file_name,
            },
        )

    return {
        "document": result.document,
        "extraction_id": result.extraction_id,
        "approval_id": result.approval_id,
        "confidence": result.confidence,
        "validation_status": result.validation_status,
        "validation": result.checks,
    }
