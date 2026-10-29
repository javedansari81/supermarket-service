"""
Customer login one-time codes: generation, hashing and sending.

Codes are checked by this app, not by the SMS provider, so a provider only has to
send a message. Add a provider by writing a sender and registering it in SENDERS.
Production uses StartMessaging (their DLT-registered route, so no DLT setup of our own).
"""
import hashlib
import hmac
import json
import logging
import secrets
import urllib.error
import urllib.request
from typing import Callable, Dict

from fastapi import HTTPException, status
from app.core.config import settings

logger = logging.getLogger("app.otp")

OTP_LENGTH = 6


def _provider() -> str:
    return settings.OTP_PROVIDER.strip().lower()


def generate_code() -> str:
    if _provider() == "fixed":
        return settings.OTP_FIXED_CODE
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def hash_code(mobile: str, code: str) -> str:
    message = f"{mobile}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def code_matches(mobile: str, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(mobile, code), code_hash)


def _console_sender(mobile: str, code: str) -> None:
    """Development only: writes the code to the log instead of sending an SMS"""
    logger.warning("OTP for %s: %s (console provider, not sent)", mobile, code)


def _fixed_sender(mobile: str, code: str) -> None:
    """Testing only: every login uses OTP_FIXED_CODE and nothing is sent"""
    logger.warning("Fixed OTP login requested for %s (fixed provider, not sent)", mobile)


def _masked(mobile: str) -> str:
    return f"{mobile[:2]}******{mobile[-2:]}"


def _startmessaging_sender(mobile: str, code: str) -> None:
    """SMS through StartMessaging (POST /otp/send). Our code is sent as variables.otp and
    checked by this app; their /otp/verify is not used. Neither the key nor the code is logged."""
    body = {"phoneNumber": f"+91{mobile}",
            "variables": {"otp": code, "appName": settings.STARTMESSAGING_APP_NAME}}
    if settings.STARTMESSAGING_TEMPLATE_ID:
        body["templateId"] = settings.STARTMESSAGING_TEMPLATE_ID
    request = urllib.request.Request(
        f"{settings.STARTMESSAGING_API_URL.rstrip('/')}/otp/send",
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "X-API-Key": settings.STARTMESSAGING_API_KEY},
    )
    timeout = settings.STARTMESSAGING_TIMEOUT_SECONDS
    try:
        with urllib.request.urlopen(request, timeout=timeout) as res:
            reply = json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        # 401/403: check STARTMESSAGING_API_KEY; 402 or similar: wallet balance
        logger.error("StartMessaging refused the OTP for %s: HTTP %s", _masked(mobile), err.code)
        if err.code == 429:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail="Too many codes sent to this number. "
                                       "Try again in a few minutes.",
                                headers={"Retry-After": "300"})
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Could not send the code. Please try again shortly.")
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        logger.error("StartMessaging unreachable for %s: %s", _masked(mobile), type(err).__name__)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Could not send the code. Please try again shortly.")
    message_id = (reply.get("data") or {}).get("messageId")
    logger.info("OTP SMS queued for %s (StartMessaging message %s)", _masked(mobile), message_id)


SENDERS: Dict[str, Callable[[str, str], None]] = {
    "console": _console_sender,
    "fixed": _fixed_sender,
    "startmessaging": _startmessaging_sender,
}


def otp_enabled() -> bool:
    if _provider() == "startmessaging" and not settings.STARTMESSAGING_API_KEY:
        return False
    return _provider() in SENDERS


def send_otp(mobile: str, code: str) -> None:
    sender = SENDERS.get(_provider()) if otp_enabled() else None
    if sender is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Online login is not available right now")
    sender(mobile, code)
