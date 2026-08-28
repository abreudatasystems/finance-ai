from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import AIDocument
from app.services.open_source_ocr import process_document_with_open_source_ocr
from app.services.minio_storage import minio_service

router = APIRouter()


@router.get("/")
def get_documents(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return db.query(AIDocument).filter(AIDocument.company_id == company_id).all()


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    channel: str = Form("upload"),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    file_bytes = await file.read()

    # 1. Upload file to MinIO Object Storage
    minio_service.upload_file(file.filename, file_bytes, file.content_type or "application/pdf")

    # 2. Extract structured data via OCR / Vision pipeline
    result = await process_document_with_open_source_ocr(file_bytes, file.filename, "TechStart Lda")

    doc_id = f"DOC-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    new_doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        file_name=file.filename,
        file_size=f"{round(len(file_bytes) / 1024, 1)} KB",
        file_type=file.content_type or "application/pdf",
        channel=channel,
        status="processed",
        extracted_supplier=result.fornecedor,
        extracted_nif="PT500000000",
        extracted_amount=result.valor,
        extracted_vat=result.iva,
        extracted_date=result.data,
        suggested_category=result.categoria,
        suggested_category_id="CAT001_1",
        ai_confidence=result.confianca,
        is_recurring=True,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc
