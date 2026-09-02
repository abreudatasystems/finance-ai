import os
import secrets
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Finance AI API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Security
    # In production ALWAYS provide SECRET_KEY via environment variable.
    # When unset we generate an ephemeral key so tokens simply don't survive a
    # restart in development instead of shipping a hard-coded secret.
    #: "production" makes the checks below refuse to start on an unsafe config.
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SECRET_KEY: str = os.getenv("SECRET_KEY", secrets.token_urlsafe(48))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = "sqlite:///./finance_ai.db"

    # CORS — comma separated list of allowed origins (no wildcard with credentials)
    BACKEND_CORS_ORIGINS: Union[str, List[str]] = "http://localhost:3000,http://127.0.0.1:3000"

    # Webhook shared secret (protects machine-to-machine ingestion endpoints)
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "")

    # Email (optional). Without SMTP_HOST nothing is sent and the invitation
    # link is handed back to be copied — see app/services/mailer.py.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    SMTP_STARTTLS: bool = os.getenv("SMTP_STARTTLS", "1") not in ("0", "false", "False")
    SMTP_SSL: bool = os.getenv("SMTP_SSL", "0") in ("1", "true", "True")
    #: Where the invitation links point — the app's public address.
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "http://localhost:3000")

    # Dify AI Integration
    DIFY_API_KEY: str = os.getenv("DIFY_API_KEY", "")
    DIFY_API_URL: str = os.getenv("DIFY_API_URL", "https://api.dify.ai/v1")

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    class Config:
        case_sensitive = True


settings = Settings()


def check_production_config(current: "Settings" = None) -> list[str]:
    """Problems that must not reach production. Empty list means fine.

    Returned rather than raised so the caller decides: the app refuses to
    start, while a test can read the list.
    """
    current = current or settings
    problems = []

    if not os.getenv("SECRET_KEY"):
        problems.append(
            "SECRET_KEY não está definido. Sem ele a chave é gerada a cada arranque, "
            "todas as sessões caem em cada reinício e dois processos assinam tokens "
            "diferentes."
        )
    elif len(current.SECRET_KEY) < 32:
        problems.append("SECRET_KEY é demasiado curto — use pelo menos 32 caracteres aleatórios.")

    if any("localhost" in origin or "127.0.0.1" in origin
           for origin in (current.BACKEND_CORS_ORIGINS or [])):
        problems.append(
            "BACKEND_CORS_ORIGINS ainda aponta para localhost — defina os domínios reais."
        )

    if current.DATABASE_URL.startswith("sqlite"):
        problems.append(
            "DATABASE_URL usa SQLite. Serve para desenvolvimento; em produção, com "
            "escritas em paralelo, use PostgreSQL."
        )

    return problems


def is_production() -> bool:
    return (settings.ENVIRONMENT or "").lower() in ("production", "prod")
