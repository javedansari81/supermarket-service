"""
Encryption of stored secrets (stores' payment gateway keys) with PAYMENT_ENCRYPTION_KEY.
Fernet (AES with an integrity check) from the cryptography package. Changing the key makes
saved secrets unreadable: they must then be entered again.
"""
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings


class EncryptionNotConfigured(Exception):
    """PAYMENT_ENCRYPTION_KEY is not set or not a valid key"""


def _fernet() -> Fernet:
    key = settings.PAYMENT_ENCRYPTION_KEY.strip()
    if not key:
        raise EncryptionNotConfigured("PAYMENT_ENCRYPTION_KEY is not set")
    try:
        return Fernet(key.encode())
    except ValueError as exc:
        raise EncryptionNotConfigured("PAYMENT_ENCRYPTION_KEY is not a valid key") from exc


def is_configured() -> bool:
    try:
        _fernet()
        return True
    except EncryptionNotConfigured:
        return False


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    """Raises EncryptionNotConfigured, or InvalidToken when the key has changed"""
    return _fernet().decrypt(token.encode()).decode()


__all__ = ["EncryptionNotConfigured", "InvalidToken", "is_configured", "encrypt", "decrypt"]


if __name__ == "__main__":
    # One-time key for .env (keep it secret; changing it makes saved secrets unreadable)
    print(f"PAYMENT_ENCRYPTION_KEY={Fernet.generate_key().decode()}")
