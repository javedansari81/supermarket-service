"""
Sale schemas
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator
from app.schemas.base import TimestampSchema
from app.schemas.settings import GSTIN_PATTERN, GST_STATE_CODES
from app.schemas.customer import normalize_mobile


class SaleItemCreate(BaseModel):
    """Schema for creating a sale item"""
    product_id: int
    quantity: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")


class SaleItemResponse(BaseModel):
    """Schema for sale item response"""
    id: int
    product_id: int
    product_name: str
    barcode: Optional[str]
    hsn_code: Optional[str] = None
    unit_type: Optional[str] = None
    mrp: Optional[Decimal] = None
    quantity: Decimal
    unit_price: Decimal
    taxable_value: Optional[Decimal] = Decimal("0")
    tax_percent: Decimal
    tax_amount: Decimal
    cgst_amount: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    igst_amount: Optional[Decimal] = Decimal("0")
    discount_percent: Decimal
    discount_amount: Decimal
    line_total: Decimal

    model_config = {"from_attributes": True}


class SaleCreate(BaseModel):
    """Schema for creating a sale"""
    items: List[SaleItemCreate]
    payment_mode: Optional[str] = "cash"
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_gstin: Optional[str] = None
    place_of_supply_code: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("customer_phone")
    @classmethod
    def validate_customer_phone(cls, v: Optional[str]) -> Optional[str]:
        return normalize_mobile(v)

    @field_validator("customer_name")
    @classmethod
    def strip_customer_name(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None

    @field_validator("customer_gstin")
    @classmethod
    def validate_customer_gstin(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().upper()
        if v and not GSTIN_PATTERN.match(v):
            raise ValueError("Invalid customer GSTIN format")
        return v or None

    @field_validator("place_of_supply_code")
    @classmethod
    def validate_place_of_supply(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        if v and v not in GST_STATE_CODES:
            raise ValueError("Invalid place of supply state code")
        return v or None


class SaleResponse(TimestampSchema):
    """Schema for sale response"""
    id: int
    tenant_id: int
    sale_no: str
    sale_date: datetime
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    payment_mode: str
    payment_status: str
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_gstin: Optional[str] = None
    customer_id: Optional[int] = None
    place_of_supply: Optional[str] = None
    is_interstate: Optional[bool] = False
    cgst_amount: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    igst_amount: Optional[Decimal] = Decimal("0")
    remarks: Optional[str]
    status: str
    items: List[SaleItemResponse] = []
    cashier_name: Optional[str] = None
    invoice_id: Optional[int] = None
    invoice_no: Optional[str] = None


class SaleListResponse(BaseModel):
    """Schema for sale list response"""
    items: List[SaleResponse]
    total: int
    page: int
    page_size: int


class CartItem(BaseModel):
    """Schema for cart item (frontend use)"""
    product_id: int
    product_name: str
    barcode: Optional[str]
    quantity: Decimal
    unit_price: Decimal
    tax_percent: Decimal
    discount_percent: Decimal = Decimal("0")
    line_total: Decimal

