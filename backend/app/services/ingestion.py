"""Um documento entra sempre pelo mesmo sítio.

Havia dois caminhos de entrada e só um deles lia o ficheiro. O carregamento
pela aplicação validava os bytes, calculava o hash, detectava duplicados,
passava o OCR, sugeria categoria e punha o resultado na fila de aprovação. Os
webhooks — email e WhatsApp — escreviam **valores fixos no código**: toda a
fatura que chegasse por email era registada como 450,00 € com 103,50 € de IVA,
categoria Marketing, 95% de confiança, o anexo nunca aberto. Esses números
seguiam para aprovação como se fossem lidos, viravam obrigações, e entravam no
resultado e na previsão de tesouraria.

Isto é o caminho, um só, partilhado pelos dois. Quem ingere passa os bytes; o
que sai é o que o documento diz.

**Porque não se vai buscar o ficheiro a um URL.** Os fornecedores de email e
de mensagens costumam mandar uma ligação em vez do conteúdo. Seguir essa
ligação é dar a um terceiro o poder de escolher que endereço é que o servidor
visita — a rede interna, o serviço de metadados da nuvem — e é o décimo da
lista da OWASP. O conteúdo vem no corpo, em base64, ou não entra.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.core import uploads
from app.models.models import (
    AIApprovalItem,
    AIDocument,
    AIExtraction,
    AuditLog,
    Category,
    Supplier,
)
from app.services.open_source_ocr import (
    AI_MODEL,
    AI_VERSION,
    compute_hash,
    process_document,
    suggest_category,
)
from app.services.storage import document_storage, object_key


class DuplicateDocument(Exception):
    """O mesmo ficheiro já entrou nesta empresa."""

    def __init__(self, existing: AIDocument):
        self.existing = existing
        super().__init__("Documento duplicado")


@dataclass
class Ingested:
    """O que ficou registado, para quem chamou responder ao seu cliente."""

    document: AIDocument
    extraction_id: str
    approval_id: Optional[str]
    confidence: float
    validation_status: str
    checks: list


def _stamp() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


async def ingest(
    db: Session,
    *,
    company_id: str,
    file_bytes: bytes,
    file_name: str,
    channel: str = "upload",
    actor: str = "Sistema",
) -> Ingested:
    """Guarda o documento, lê-o, e põe o que leu à espera de decisão humana.

    Nunca cria um lançamento. Um item aprovado só vira obrigação quando alguém
    decidir, no módulo de aprovações — e essa é a regra que faz a diferença
    entre um registo e uma invenção.

    Levanta ``uploads.UploadRejected`` se os bytes não forem o que dizem ser, e
    ``DuplicateDocument`` se o mesmo conteúdo já existir na empresa.
    """
    # O que os bytes são, não o que o nome ou o cliente afirmam.
    detected_type = uploads.validate(file_bytes, file_name or "")
    file_hash = compute_hash(file_bytes)

    duplicate = (
        db.query(AIDocument)
        .filter(AIDocument.company_id == company_id, AIDocument.file_hash == file_hash)
        .first()
    )
    if duplicate:
        raise DuplicateDocument(duplicate)

    parsed, raw_text = await process_document(file_bytes, file_name)

    categories = db.query(Category).filter(Category.company_id == company_id).all()
    cat_id, cat_name = suggest_category(parsed, categories)

    # Cruza com o registo de fornecedores da própria empresa quando dá.
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

    # A chave leva a empresa e o hash do conteúdo: o prefixo separa as empresas
    # e o hash separa ficheiros diferentes com o mesmo nome.
    document_storage.put(object_key(company_id, file_hash, file_name),
                         file_bytes, detected_type)

    doc_status = "extracted" if parsed.validation_status == "valid" else "needs_review"

    new_doc = AIDocument(
        id=doc_id,
        company_id=company_id,
        file_name=file_name,
        file_size=f"{round(len(file_bytes) / 1024, 1)} KB",
        file_type=detected_type,
        channel=channel,
        status=doc_status,
        upload_date=now.isoformat(),
        file_url=f"/api/v1/documents/{doc_id}/file",
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
        uploaded_by=actor,
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
        raw_result=json.dumps(
            {"raw_text": raw_text, "parsed": parsed.as_dict()}, ensure_ascii=False
        ),
        processed_at=now,
    )
    db.add(extraction)

    # Só vai a aprovação o que tem valor legível. Um documento sem total não
    # entra na fila a fingir que tem zero euros — fica a pedir revisão.
    approval_id = None
    if parsed.gross_amount and parsed.gross_amount > 0:
        approval_id = f"APP-{stamp}"
        db.add(AIApprovalItem(
            id=approval_id,
            company_id=company_id,
            document_id=doc_id,
            document_name=file_name,
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
        user=actor,
        action="Documento Processado",
        module="Finance Inbox",
        description=(
            f"{file_name}: extração {parsed.validation_status} "
            f"({int(round(parsed.confidence * 100))}% confiança)"
            + (" — enviado para aprovação" if approval_id
               else " — sem valor legível, requer revisão")
        ),
        entity_id=doc_id,
    ))

    db.commit()
    db.refresh(new_doc)

    return Ingested(
        document=new_doc,
        extraction_id=extraction.id,
        approval_id=approval_id,
        confidence=parsed.confidence,
        validation_status=parsed.validation_status,
        checks=parsed.checks,
    )
