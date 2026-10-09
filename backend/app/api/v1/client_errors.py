"""Erros do navegador: o frontend avisa aqui quando uma página rebenta.

Sem autenticação (a página que falhou pode ser a de entrada), por isso com
limite por endereço e campos cortados. O erro fica no registo como
``financeai.client`` a nível ERROR — e, se o Sentry estiver ligado, chega lá
pela integração de logging.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("financeai.client")

RATE_LIMIT = 30          # relatórios por endereço...
RATE_WINDOW = 60.0       # ...por minuto
MAX_MESSAGE = 500
MAX_STACK = 4000
MAX_SHORT = 300

_hits: dict[str, deque] = {}
_lock = threading.Lock()


def reset() -> None:
    """Para os testes."""
    with _lock:
        _hits.clear()


def _allowed(address: str) -> bool:
    now = time.monotonic()
    with _lock:
        if len(_hits) > 10_000:                 # não crescer sem fim
            for key in [k for k, q in _hits.items() if not q or now - q[-1] > RATE_WINDOW]:
                del _hits[key]
        q = _hits.setdefault(address, deque())
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return False
        q.append(now)
        return True


def _cut(value, limit: int) -> str:
    if value is None:
        return ""
    text = str(value).replace("\x00", "")
    return text if len(text) <= limit else text[:limit] + "…[cortado]"


class ClientError(BaseModel):
    # Tudo opcional e sem limites aqui: cortar é melhor do que recusar com 422
    # e perder o relatório.
    message: str | None = None
    stack: str | None = None
    url: str | None = None
    digest: str | None = None
    userAgent: str | None = None
    context: str | None = None


MAX_BODY = 32_000


@router.post("", status_code=204, include_in_schema=False)
@router.post("/", status_code=204, include_in_schema=False)
async def report_client_error(request: Request) -> Response:
    address = request.client.host if request.client else "desconhecido"
    if not _allowed(address):
        return Response(status_code=429)
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared > MAX_BODY:
        return Response(status_code=413)
    body = await request.body()
    if len(body) > MAX_BODY:
        return Response(status_code=413)
    try:
        payload = ClientError.model_validate_json(body or b"{}")
    except ValueError:
        return Response(status_code=400)
    # Só o caminho: a query string pode trazer filtros com dados.
    url = _cut((payload.url or "").split("?")[0].split("#")[0], MAX_SHORT)
    # O fileConfig do Alembic desliga loggers já criados quando as migrações
    # correm depois do arranque; este relatório não se pode perder em silêncio.
    logger.disabled = False
    logger.error(
        "Erro no navegador: %s | contexto=%s url=%s digest=%s ua=%s\n%s",
        _cut(payload.message, MAX_MESSAGE) or "(sem mensagem)",
        _cut(payload.context, 100),
        url,
        _cut(payload.digest, 100),
        _cut(payload.userAgent, MAX_SHORT),
        _cut(payload.stack, MAX_STACK),
    )
    return Response(status_code=204)
