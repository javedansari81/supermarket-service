"""
Online order schemas: delivery addresses, checkout quote, orders
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator
from app.schemas.customer import normalize_mobile

MAX_ORDER_PRODUCTS = 50


class AddressIn(BaseModel):
    contact_name: str = Field(..., min_length=1, max_length=200)
    contact_mobile: str
    address_line: str = Field(..., min_length=3, max_length=300)
    area: str = Field(..., min_length=2, max_length=200)
    landmark: Optional[str] = Field(None, max_length=200)
    city: str = Field(..., min_length=2, max_length=100)
    pincode: str = Field(..., pattern=r"^[1-9][0-9]{5}$")
    label: Optional[str] = Field(None, max_length=20)
    is_default: bool = False

    @field_validator("contact_name", "address_line", "area", "city")
    @classmethod
    def required_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v

    @field_validator("landmark", "label")
    @classmethod
    def optional_text(cls, v: Optional[str]) -> Optional[str]:
        return (v.strip() or None) if v is not None else None

    @field_validator("contact_mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        mobile = normalize_mobile(v)
        if not mobile:
            raise ValueError("Mobile number is required")
        return mobile


class AddressResponse(AddressIn):
    id: int

    model_config = {"from_attributes": True}


class AddressListResponse(BaseModel):
    items: List[AddressResponse]


class CartItemIn(BaseModel):
    product_id: int
    # Packs, or kg / L for loose items
    quantity: Decimal = Field(..., gt=0, max_digits=8, decimal_places=3)


class QuoteRequest(BaseModel):
    items: List[CartItemIn] = Field(..., min_length=1, max_length=MAX_ORDER_PRODUCTS)

    @field_validator("items")
    @classmethod
    def unique_products(cls, v: List[CartItemIn]) -> List[CartItemIn]:
        if len({i.product_id for i in v}) != len(v):
            raise ValueError("Each product can be in the cart only once")
        return v


class OrderCreate(QuoteRequest):
    address_id: int
    payment_method: Literal["cod", "online"]
    notes: Optional[str] = Field(None, max_length=500)
    # Total the customer saw; the order is refused if prices changed since
    expected_total: Decimal


class QuoteLine(BaseModel):
    product_id: int
    product_name: str
    is_loose: bool
    unit_type: Optional[str] = None
    quantity: Decimal
    mrp: Optional[Decimal] = None
    unit_price: Decimal
    offer_price: Decimal
    discount_source: Optional[str] = None
    offer_name: Optional[str] = None
    line_total: Decimal

    model_config = {"from_attributes": True}


class QuoteProblem(BaseModel):
    """A cart line that cannot be ordered as it is"""
    product_id: int
    product_name: Optional[str] = None
    # unavailable = no longer sold online; short = less stock than asked (available is the most)
    reason: Literal["unavailable", "short"]
    available: Optional[Decimal] = None


class Totals(BaseModel):
    mrp_total: Decimal
    discount_amount: Decimal
    items_total: Decimal
    delivery_charge: Decimal
    total_amount: Decimal


class QuoteResponse(Totals):
    items: List[QuoteLine]
    problems: List[QuoteProblem]
    free_delivery_min: Decimal


class OrderSummary(Totals):
    id: int
    order_no: str
    store: str
    store_name: str
    status: str
    payment_method: str
    payment_status: str
    item_count: int
    created_at: datetime


class OrderResponse(OrderSummary):
    items: List[QuoteLine]
    delivery_name: str
    delivery_mobile: str
    delivery_address: str
    notes: Optional[str] = None
    cancel_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    can_cancel: bool


class OrderListResponse(BaseModel):
    items: List[OrderSummary]
    total: int
    page: int
    page_size: int


class OrderCancel(BaseModel):
    reason: Optional[str] = Field(None, max_length=300)
