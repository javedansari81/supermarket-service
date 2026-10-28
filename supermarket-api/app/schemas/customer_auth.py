"""
Customer login (mobile OTP) schemas
"""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from app.schemas.customer import normalize_mobile


class MobileIn(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        mobile = normalize_mobile(v)
        if not mobile:
            raise ValueError("Mobile number is required")
        return mobile


class OtpRequest(MobileIn):
    """Ask for a login code by SMS"""


class OtpRequestResponse(BaseModel):
    message: str
    expires_in: int
    resend_in: int


class OtpVerify(MobileIn):
    """Log in with the code; creates the account on first login"""
    code: str = Field(..., pattern=r"^[0-9]{6}$")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class AccountResponse(BaseModel):
    id: int
    mobile: str
    customer_name: Optional[str] = None

    model_config = {"from_attributes": True}


class AccountUpdate(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=200)

    @field_validator("customer_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class CustomerToken(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int
    # No name on record yet: the shop asks for it after login
    needs_name: bool
    account: AccountResponse


class MyStore(BaseModel):
    """A store where the customer already has a record (in-store billing or online orders)"""
    store: str
    store_name: str
    # Loyalty points at this store (0 when the store has no loyalty scheme)
    points_balance: int = 0


class MyStoresResponse(BaseModel):
    items: List[MyStore]
