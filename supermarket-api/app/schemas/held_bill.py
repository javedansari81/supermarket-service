"""
Held (parked) bill schemas
"""
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from app.schemas.base import TimestampSchema
from app.schemas.customer import normalize_mobile


class HeldBillItem(BaseModel):
    """One cart line as shown at the counter; prices are re-checked at checkout"""
    product_id: int
    batch_id: Optional[int] = None
    product_name: str
    barcode: Optional[str] = None
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    mrp: Optional[Decimal] = None
    unit_type: Optional[str] = None
    is_loose: bool = False
    tax_percent: Decimal = Decimal("0")
    discount_percent: Decimal = Field(Decimal("0"), ge=0, le=100)
    # Near-expiry % shown when held, and whether the cashier removed it
    clearance_percent: Decimal = Field(Decimal("0"), ge=0, le=100)
    skip_clearance: bool = False
    # Offer shown when held
    offer_id: Optional[int] = None
    offer_name: Optional[str] = Field(None, max_length=100)
    offer_type: Optional[str] = None
    offer_value: Optional[Decimal] = None
    line_total: Decimal = Decimal("0")


class HeldBillCreate(BaseModel):
    """Schema for holding (parking) a cart"""
    items: List[HeldBillItem] = Field(min_length=1)
    label: Optional[str] = Field(None, max_length=100)
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_phone: Optional[str] = None

    @field_validator("customer_phone")
    @classmethod
    def validate_customer_phone(cls, v: Optional[str]) -> Optional[str]:
        return normalize_mobile(v)

    @field_validator("label", "customer_name")
    @classmethod
    def strip_text(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


class HeldBillResponse(TimestampSchema):
    """Schema for held bill response"""
    id: int
    label: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: List[HeldBillItem] = []
    item_count: int
    total_amount: Decimal
    created_by: Optional[int] = None
    cashier_name: Optional[str] = None


class HeldBillListResponse(BaseModel):
    """Schema for held bill list response"""
    items: List[HeldBillResponse]
    total: int
