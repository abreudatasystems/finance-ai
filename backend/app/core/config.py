import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Finance AI API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "FINANCE_AI_SUPER_SECRET_KEY_JWT_2026_PRODUCTION"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    DATABASE_URL: str = "sqlite:///./finance_ai.db"
    
    # Dify AI Integration
    DIFY_API_KEY: str = "app-dify-mock-key"
    DIFY_API_URL: str = "https://api.dify.ai/v1"
    
    class Config:
        case_sensitive = True

settings = Settings()
