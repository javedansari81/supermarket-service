"""
Coupon code schemas
"""
import re
from typing import Optional, List, Literal
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.sale import SaleItemCreate
from app.schemas.customer import normalize_mobile
from app.core.coupons import normalize_code

CODE_PATTERN = re.compile(r"^[A-Z0-9_-]{3,30}$")


class CouponIn(BaseModel):
    """'percent' off each line (max_discount caps the total) or 'amount' (Rs) off the bill"""
    code: str
    description: Optional[str] = Field(None, max_length=200)
    discount_type: Literal["percent", "amount"]
    discount_value: Decimal = Field(gt=0, lt=Decimal("100000000"), decimal_places=2)
    max_discount: Optional[Decimal] = Field(None, gt=0, lt=Decimal("100000000"))
    min_bill_amount: Decimal = Field(Decimal("0"), ge=0, lt=Decimal("10000000000"))
    start_date: date
    end_date: date
    is_active: bool = True
    usage_limit: Optional[int] = Field(None, gt=0)
    per_customer_limit: Optional[int] = Field(None, gt=0)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = normalize_code(v) or ""
        if not CODE_PATTERN.match(v):
            raise ValueError("Code must be 3-30 letters, digits, - or _")
        return v

    @field_validator("description")
    @classmethod
    def strip_description(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None

    @model_validator(mode="after")
    def check_values(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("Percent off cannot be more than 100")
        if self.discount_type == "amount":
            self.max_discount = None
        return self


class CouponResponse(BaseModel):
    id: int
    code: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    max_discount: Optional[Decimal] = None
    min_bill_amount: Decimal
    start_date: date
    end_date: date
    is_active: bool
    usage_limit: Optional[int] = None
    per_customer_limit: Optional[int] = None
    # 'running', 'upcoming', 'ended' or 'inactive'
    status: str
    times_used: int = 0


class CouponListResponse(BaseModel):
    items: List[CouponResponse]


class CouponCheckRequest(BaseModel):
    """The cart as it would be checked out"""
    code: str = Field(min_length=1, max_length=30)
    items: List[SaleItemCreate] = Field(min_length=1)
    customer_phone: Optional[str] = None

    @field_validator("code")
    @classmethod
    def normalize(cls, v: str) -> str:
        return normalize_code(v) or ""

    @field_validator("customer_phone")
    @classmethod
    def validate_customer_phone(cls, v: Optional[str]) -> Optional[str]:
        return normalize_mobile(v)


class CouponCheckItem(BaseModel):
    # Position of the cart line in the request
    index: int
    # Rupees off from the coupon; 0 where the line's own discount is higher
    coupon_amount: Decimal


class CouponCheckResponse(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    # Rupees off from the coupon, and the extra saving over the lines' own discounts
    coupon_discount: Decimal
    saving: Decimal
    items: List[CouponCheckItem]
    notes: List[str] = []
