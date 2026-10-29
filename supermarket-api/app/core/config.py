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

    # Order updates by browser notification (Web Push). Empty keys switch it off. Make the keys
    # once with `python -m app.core.push` and never change them (customers would have to turn
    # updates on again); the private key is a secret, keep it in .env
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    # Contact for the push services, e.g. mailto:support@mfmart.co.in
    VAPID_SUBJECT: str = "mailto:support@mfmart.co.in"
    PUSH_TIMEOUT_SECONDS: int = 10
    # Unread updates are dropped by the push service after this (device off for long)
    PUSH_TTL_SECONDS: int = 86400

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # Store subdomains (e.g. "mfmart.co.in" -> store1.mfmart.co.in); empty disables the check
    BASE_DOMAIN: str = ""

    # Header with the visitor's IP set by the hosting proxy (App Platform: do-connecting-ip);
    # when missing, the connection's address is used
    CLIENT_IP_HEADER: str = "do-connecting-ip"

    # Request limits on the public shop API, per visitor IP or per customer account
    # (counted in each API instance's memory); over the limit answers 429 with Retry-After
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_OTP_REQUEST_PER_MINUTE: int = 5
    RATE_LIMIT_OTP_VERIFY_PER_MINUTE: int = 10
    RATE_LIMIT_REFRESH_PER_MINUTE: int = 30
    RATE_LIMIT_CATALOGUE_PER_MINUTE: int = 120
    RATE_LIMIT_IMAGES_PER_MINUTE: int = 300
    RATE_LIMIT_QUOTE_PER_MINUTE: int = 30
    RATE_LIMIT_ORDERS_PER_HOUR_ACCOUNT: int = 10
    RATE_LIMIT_ORDERS_PER_HOUR_IP: int = 20
    RATE_LIMIT_ADDRESSES_PER_HOUR: int = 30
    RATE_LIMIT_PUSH_PER_HOUR: int = 30

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
    # Product images (same R2 bucket). PRODUCT_IMAGE_PUBLIC_URL = public address of the bucket
    # (R2 public domain, e.g. https://images.mfmart.co.in); empty = images are served by the API
    PRODUCT_IMAGE_MAX_MB: int = 5
    PRODUCT_IMAGE_PUBLIC_URL: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

