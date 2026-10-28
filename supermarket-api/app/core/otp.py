"""
Customer login one-time codes: generation, hashing and sending.

Codes are checked by this app, not by the SMS provider, so a provider only has to
send a message. Add a provider by writing a sender and registering it in SENDERS.
"""
import hashlib
import hmac
import logging
import secrets
from typing import Callable, Dict

from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger("app.otp")

OTP_LENGTH = 6


def generate_code() -> str:
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def hash_code(mobile: str, code: str) -> str:
    message = f"{mobile}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def code_matches(mobile: str, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(mobile, code), code_hash)


def _console_sender(mobile: str, code: str) -> None:
    """Development only: writes the code to the log instead of sending an SMS"""
    logger.warning("OTP for %s: %s (console provider, not sent)", mobile, code)


SENDERS: Dict[str, Callable[[str, str], None]] = {
    "console": _console_sender,
}


def otp_enabled() -> bool:
    return settings.OTP_PROVIDER.strip().lower() in SENDERS


def send_otp(mobile: str, code: str) -> None:
    sender = SENDERS.get(settings.OTP_PROVIDER.strip().lower())
    if sender is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Online login is not available right now")
    sender(mobile, code)
