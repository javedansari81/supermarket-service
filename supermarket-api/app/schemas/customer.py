"""
Customer schemas
"""
import re
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator
from app.schemas.settings import GSTIN_PATTERN

MOBILE_PATTERN = re.compile(r"^[6-9][0-9]{9}$")


def normalize_mobile(value: Optional[str]) -> Optional[str]:
    """Reduce an Indian mobile number to its 10 digits; raise ValueError if invalid"""
    digits = re.sub(r"[^0-9]", "", value or "")
    if not digits:
        return None
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not MOBILE_PATTERN.match(digits):
        raise ValueError("Invalid mobile number (10 digits starting with 6-9)")
    return digits


class CustomerUpdate(BaseModel):
    """Schema for updating a customer"""
    customer_name: Optional[str] = None
    customer_gstin: Optional[str] = None
    status: Optional[str] = None

    @field_validator("customer_name")
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None

    @field_validator("customer_gstin")
    @classmethod
    def validate_gstin(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().upper()
        if v and not GSTIN_PATTERN.match(v):
            raise ValueError("Invalid GSTIN (15 characters, e.g. 27ABCDE1234F1Z5)")
        return v or None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("active", "inactive"):
            raise ValueError("Status must be active or inactive")
        return v


class CustomerResponse(BaseModel):
    """Customer with purchase summary"""
    id: int
    mobile: str
    customer_name: Optional[str] = None
    customer_gstin: Optional[str] = None
    status: str
    visits: int = 0
    total_spent: Decimal = Decimal("0")
    first_visit: Optional[datetime] = None
    last_visit: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerListResponse(BaseModel):
    """Schema for customer list response"""
    items: List[CustomerResponse]
    total: int
    page: int
    page_size: int


class CustomerSaleRow(BaseModel):
    """One past bill of a customer"""
    sale_id: int
    sale_no: str
    sale_date: datetime
    invoice_id: Optional[int] = None
    invoice_no: Optional[str] = None
    item_count: int
    total_amount: Decimal
    payment_mode: Optional[str] = None
    status: str


class CustomerSalesResponse(BaseModel):
    """Paginated bills of a customer"""
    items: List[CustomerSaleRow]
    total: int
    page: int
    page_size: int
