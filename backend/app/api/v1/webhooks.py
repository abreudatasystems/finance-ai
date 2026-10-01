"""Documentos que chegam sozinhos — por email ou por WhatsApp.

O que estava aqui não lia nada. Uma fatura recebida por email era registada
com estes valores, escritos no código:

    amount=450.0, vat=103.5, category="Marketing", confidence=95

Sempre os mesmos, fosse qual fosse o anexo — que nunca era aberto. E o
``company_id`` vinha do corpo do pedido, com ``COMP001`` por omissão: quem
chamasse o endpoint escolhia em que empresa escrevia. Os dois defeitos juntos
punham dinheiro inventado no livro de uma empresa à escolha de quem chamasse,
e daí seguia para aprovação, para obrigação, para o resultado e para a
previsão de tesouraria.

Passa a ser assim:

* **A empresa vem do segredo, não do corpo.** Cada empresa tem o seu
  ``ingest_token``, gerado nas definições. O cabeçalho ``X-Ingest-Token``
  identifica-a; um token desconhecido é 401 e não escreve nada.
* **O conteúdo é lido.** O ficheiro entra em base64 no corpo e passa pelo
  mesmo caminho do carregamento manual — validação dos bytes, hash,
  duplicados, OCR, sugestão de categoria, fila de aprovação.
* **Não se vai buscar nada a um URL.** Seguir uma ligação escolhida por
  terceiros é deixá-los apontar o servidor à rede interna. Quem integra
  converte o anexo para base64 do seu lado.
"""

import base64
import binascii
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core import uploads
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Company
from app.services import ingestion

router = APIRouter()

#: Um anexo maior do que isto não é uma fatura — e o corpo em base64 cresce
#: um terço acima do tamanho do ficheiro.
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024


def verify_gateway_secret(x_webhook_secret: Optional[str] = Header(default=None)):
    """Portão opcional à frente de todos os canais.

    ``WEBHOOK_SECRET`` é do operador, não da empresa: serve para fechar o
    endpoint ao mundo quando ele está exposto. Não identifica ninguém — isso é
    o ``X-Ingest-Token`` que faz, e esse é obrigatório sempre.
    """
    if settings.WEBHOOK_SECRET and x_webhook_secret != settings.WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Assinatura de webhook inválida")


def company_from_token(
    db: Session = Depends(get_db),
    x_ingest_token: Optional[str] = Header(default=None),
) -> Company:
    """A empresa a que o documento pertence, deduzida do segredo apresentado.

    Sem token não há empresa, e sem empresa não há escrita. A mensagem de erro
    é a mesma para um token em falta e para um token errado: dizer qual dos
    dois foi ajuda quem está a tentar adivinhar.
    """
    token = (x_ingest_token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token de ingestão em falta")

    company = db.query(Company).filter(Company.ingest_token == token).first()
    if not company:
        raise HTTPException(status_code=401, detail="Token de ingestão inválido")
    return company


def _attachment(data: dict) -> tuple[bytes, str]:
    """Os bytes do anexo e o nome com que ficam registados.

    O conteúdo vem em base64 no corpo. Um pedido que traga só um URL é
    recusado com a razão — é uma decisão, não uma limitação por esquecimento.
    """
    if data.get("media_url") or data.get("url"):
        if not data.get("content_base64"):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Este endpoint não descarrega ficheiros a partir de URLs. "
                    "Envie o conteúdo em 'content_base64'."
                ),
            )

    encoded = data.get("content_base64")
    if not encoded:
        raise HTTPException(
            status_code=400,
            detail="Falta o anexo: 'content_base64' com o conteúdo do documento",
        )

    try:
        file_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="'content_base64' não é base64 válido")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="O anexo está vazio")
    if len(file_bytes) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Anexo acima do limite de {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB",
        )

    file_name = str(data.get("filename") or "documento").strip() or "documento"
    return file_bytes, file_name


async def _receive(db: Session, company: Company, data: dict, *,
                   channel: str, actor: str) -> dict:
    """O mesmo tratamento para os dois canais. O que muda é só a proveniência."""
    file_bytes, file_name = _attachment(data)

    try:
        result = await ingestion.ingest(
            db,
            company_id=company.id,
            file_bytes=file_bytes,
            file_name=file_name,
            channel=channel,
            actor=actor,
        )
    except uploads.UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ingestion.DuplicateDocument as exc:
        # Reenvios acontecem — um fornecedor que manda a mesma fatura duas
        # vezes, um webhook repetido pela plataforma de origem. Não é erro do
        # remetente, e sobretudo não pode gerar um segundo documento.
        return {
            "status": "duplicate",
            "document_id": exc.existing.id,
            "channel": channel,
        }

    return {
        "status": "success",
        "document_id": result.document.id,
        "channel": channel,
        "confidence": result.confidence,
        "validation_status": result.validation_status,
        "approval_id": result.approval_id,
    }


@router.post("/email", dependencies=[Depends(verify_gateway_secret)])
async def email_webhook(
    request: Request,
    db: Session = Depends(get_db),
    company: Company = Depends(company_from_token),
):
    data = await request.json()
    sender = str(data.get("sender") or "remetente desconhecido")
    return await _receive(db, company, data, channel="email",
                          actor=f"Email de {sender}")


@router.post("/whatsapp", dependencies=[Depends(verify_gateway_secret)])
async def whatsapp_webhook(
    request: Request,
    db: Session = Depends(get_db),
    company: Company = Depends(company_from_token),
):
    data = await request.json()
    phone = str(data.get("phone") or "número desconhecido")
    return await _receive(db, company, data, channel="whatsapp",
                          actor=f"WhatsApp de {phone}")
