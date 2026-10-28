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
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str
    DB_SCHEMA: str = "mart"
    
    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Customer login (online ordering)
    CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CUSTOMER_REFRESH_TOKEN_EXPIRE_DAYS: int = 60
    # OTP sender: "" disables customer login, "console" logs the code (development only)
    OTP_PROVIDER: str = ""
    OTP_EXPIRE_MINUTES: int = 5
    OTP_RESEND_SECONDS: int = 60
    OTP_MAX_ATTEMPTS: int = 5
    OTP_MAX_PER_MOBILE_PER_HOUR: int = 5
    OTP_MAX_PER_IP_PER_HOUR: int = 20

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # Store subdomains (e.g. "mfmart.co.in" -> store1.mfmart.co.in); empty disables the check
    BASE_DOMAIN: str = ""

    # Barcode
    BARCODE_FORMAT: str = "code128"
    BARCODE_DPI: int = 300
    
    # Invoice
    INVOICE_PREFIX: str = "INV"

    # Cloudflare R2 (supplier bill uploads)
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_ENDPOINT_URL: str = ""
    BILL_MAX_SIZE_MB: int = 10
    BILL_URL_EXPIRE_SECONDS: int = 600

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

