"""
Application configuration settings
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Supermarket Management System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str
    DB_SCHEMA: str = "mart"
    
    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # Barcode
    BARCODE_FORMAT: str = "code128"
    BARCODE_DPI: int = 300
    
    # Invoice
    INVOICE_PREFIX: str = "INV"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

