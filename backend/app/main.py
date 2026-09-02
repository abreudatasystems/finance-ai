from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import check_production_config, is_production, settings
from app.api.v1.api import api_router
from app.db.migrate import run_migrations

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

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
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

@app.get("/")
def root():
    return {
        "message": "Finance AI Backend API is running!",
        "docs": "/docs",
        "version": settings.VERSION
    }
