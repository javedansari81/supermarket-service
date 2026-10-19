"""
Sale schemas
"""
from typing import Optional, List, Literal, Annotated
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.base import TimestampSchema
from app.schemas.settings import GSTIN_PATTERN, GST_STATE_CODES
from app.schemas.customer import normalize_mobile
from app.core.coupons import normalize_code

PaymentMode = Literal["cash", "card", "upi", "points"]


class SaleItemCreate(BaseModel):
    """Schema for creating a sale item. batch_id is required for a packed item whose
    in-stock batches have different MRPs; otherwise stock is taken first expiry first.
    The near-expiry discount applies unless skip_clearance; of it, a running offer and
    the bill's coupon, the one saving the most wins."""
    product_id: int
    quantity: Decimal
    batch_id: Optional[int] = None
    skip_clearance: bool = False


class SaleItemResponse(BaseModel):
    """Schema for sale item response"""
    id: int
    product_id: int
    batch_id: Optional[int] = None
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
    discount_source: Optional[str] = None
    offer_id: Optional[int] = None
    offer_name: Optional[str] = None
    line_total: Decimal

    model_config = {"from_attributes": True}


class SalePaymentCreate(BaseModel):
    """Amount paid by one mode; reference is an optional UPI transaction id or card last digits"""
    mode: PaymentMode
    amount: Decimal = Field(..., gt=0, max_digits=12, decimal_places=2)
    reference: Optional[str] = Field(None, max_length=50)

    @field_validator("reference")
    @classmethod
    def strip_reference(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


class SalePaymentResponse(BaseModel):
    """Schema for sale payment response"""
    mode: str
    amount: Decimal
    reference: Optional[str] = None

    model_config = {"from_attributes": True}


class SaleCreate(BaseModel):
    """Schema for creating a sale. Without payments the whole bill is paid by payment_mode;
    with payments their amounts must add up to the bill total. cash_tendered is the cash
    handed over, at least the cash amount; the rest is given back as change."""
    items: List[SaleItemCreate]
    payment_mode: PaymentMode = "cash"
    payments: Optional[List[SalePaymentCreate]] = None
    cash_tendered: Optional[Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_gstin: Optional[str] = None
    place_of_supply_code: Optional[str] = None
    remarks: Optional[str] = None
    held_bill_id: Optional[int] = None
    coupon_code: Optional[str] = Field(None, max_length=30)

    @model_validator(mode="after")
    def check_payments(self) -> "SaleCreate":
        if self.payments is not None:
            if not self.payments:
                raise ValueError("Add at least one payment")
            modes = [p.mode for p in self.payments]
            if len(modes) != len(set(modes)):
                raise ValueError("Each payment mode can appear only once")
        return self

    @field_validator("coupon_code")
    @classmethod
    def normalize_coupon_code(cls, v: Optional[str]) -> Optional[str]:
        return normalize_code(v)

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
    payments: List[SalePaymentResponse] = []
    cash_tendered: Optional[Decimal] = None
    change_given: Optional[Decimal] = None
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_gstin: Optional[str] = None
    customer_id: Optional[int] = None
    place_of_supply: Optional[str] = None
    is_interstate: Optional[bool] = False
    cgst_amount: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    igst_amount: Optional[Decimal] = Decimal("0")
    coupon_id: Optional[int] = None
    coupon_code: Optional[str] = None
    coupon_discount: Optional[Decimal] = Decimal("0")
    points_earned: int = 0
    points_redeemed: int = 0
    # Customer's points balance after the bill (set on checkout)
    points_balance: Optional[int] = None
    remarks: Optional[str]
    status: str
    voided_at: Optional[datetime] = None
    voided_by: Optional[int] = None
    void_reason: Optional[str] = None
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

