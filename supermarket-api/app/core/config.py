"""
Application configuration settings
"""
from pydantic import Field
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
    # OTP sender: "" disables customer login, "startmessaging" sends an SMS, "console" logs
    # the code (development only), "fixed" accepts OTP_FIXED_CODE for every number (testing only)
    OTP_PROVIDER: str = ""
    OTP_FIXED_CODE: str = Field("123456", pattern=r"^[0-9]{6}$")
    OTP_EXPIRE_MINUTES: int = 5
    OTP_RESEND_SECONDS: int = 60
    OTP_MAX_ATTEMPTS: int = 5
    OTP_MAX_PER_MOBILE_PER_HOUR: int = 5
    OTP_MAX_PER_IP_PER_HOUR: int = 20
    # StartMessaging SMS (OTP_PROVIDER=startmessaging); the API key is a secret, keep it in .env
    STARTMESSAGING_API_KEY: str = ""
    STARTMESSAGING_API_URL: str = "https://api.startmessaging.com"
    # Only for the DLT route with an own registered template; empty uses their DLT-free route
    STARTMESSAGING_TEMPLATE_ID: str = ""
    STARTMESSAGING_APP_NAME: str = "MFMart"
    STARTMESSAGING_TIMEOUT_SECONDS: int = 10

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

