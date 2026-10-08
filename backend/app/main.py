import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import check_production_config, is_production, settings
from app.core.observability import init_monitoring
from app.api.v1.api import api_router
from app.db.migrate import run_migrations
from app.db.session import engine
from app.services import scheduler

# Sem isto só os avisos do uvicorn chegavam ao registo: o que o agendador e o
# OCR escrevem com logging.getLogger perdia-se em silêncio.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Monitorização de erros (Sentry): só liga com SENTRY_DSN definido.
init_monitoring("api")

# Refuse to start in production on a configuration that would lose sessions or
# leave the API open. Failing here is cheaper than failing with customers on it.
if is_production():
    _problems = check_production_config()
    if _problems:
        raise RuntimeError(
            "Configuração insegura para produção:\n  - " + "\n  - ".join(_problems)
        )

# Bring the schema up to date (see app/db/migrate.py).
run_migrations()

# O fileConfig do Alembic (migrations/env.py) desliga os loggers que já
# existiam — incluindo os nossos (financeai.*), e com eles o que iria para o
# registo e para o Sentry. Volta a ligá-los.
for _name, _logger in list(logging.root.manager.loggerDict.items()):
    if isinstance(_logger, logging.Logger) and (
            _name.startswith("financeai") or _name.startswith("app.")):
        _logger.disabled = False

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """O trabalho de fundo vive enquanto a aplicação viver.

    O agendador gera as recorrências vencidas de tempos a tempos. Sem ele, uma
    renda mensal esperava que alguém abrisse a aplicação e carregasse num
    botão — o que é precisamente o trabalho que uma recorrência devia poupar.
    """
    task = None
    if settings.SCHEDULER_ENABLED:
        task = scheduler.start(interval_seconds=settings.SCHEDULER_INTERVAL_HOURS * 3600)
    try:
        yield
    finally:
        if task is not None:
            task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend (restricted to configured origins —
# a wildcard origin is invalid together with allow_credentials).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health", include_in_schema=False)
# Também em /api/v1/health: o Caddy só encaminha /api/* para o backend, e é
# aí que um monitor externo (UptimeRobot, etc.) consegue chegar.
@app.get(f"{settings.API_V1_STR}/health", include_in_schema=False)
def health():
    """Para o Docker e para a monitorização: só diz que está bem se a base de
    dados responder — uma API de pé sem base de dados não serve ninguém."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:                                       # noqa: BLE001
        logging.getLogger("financeai.health").exception("Base de dados sem resposta")
        return JSONResponse(status_code=503, content={"status": "erro", "database": "sem resposta"})
    return {"status": "ok", "database": "ok", "version": settings.VERSION}


@app.get("/")
def root():
    return {
        "message": "Finance AI Backend API is running!",
        "docs": "/docs",
        "version": settings.VERSION
    }
