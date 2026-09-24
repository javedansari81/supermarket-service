"""
Sale return (credit note) and void sale schemas
"""
from typing import Optional, List, Literal
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


def _required_text(v: Optional[str]) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("Reason is required")
    return v


class SaleReturnItemCreate(BaseModel):
    """One sale line being returned"""
    sale_item_id: int
    quantity: Decimal = Field(gt=0)
    restock: bool = True


class SaleReturnCreate(BaseModel):
    """Schema for creating a return against a sale"""
    items: List[SaleReturnItemCreate] = Field(min_length=1)
    reason: str
    refund_mode: Optional[Literal["cash", "card", "upi"]] = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        return _required_text(v)


class SaleVoidRequest(BaseModel):
    """Schema for voiding a sale"""
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        return _required_text(v)


class SaleReturnItemResponse(BaseModel):
    """Schema for a returned line"""
    id: int
    sale_item_id: int
    product_id: int
    product_name: str
    unit_type: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    taxable_value: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    discount_amount: Decimal
    line_total: Decimal
    restock: bool

    model_config = {"from_attributes": True}


class SaleReturnResponse(BaseModel):
    """Schema for a return (credit note)"""
    id: int
    sale_id: int
    return_no: str
    return_date: datetime
    subtotal: Decimal
    tax_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    refund_mode: str
    reason: Optional[str] = None
    window_override: bool
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    sale_no: Optional[str] = None
    invoice_no: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: List[SaleReturnItemResponse] = []

    model_config = {"from_attributes": True}


class SaleReturnListResponse(BaseModel):
    """Schema for return list response"""
    items: List[SaleReturnResponse]
    total: int
    page: int
    page_size: int


class ReturnableItem(BaseModel):
    """Sale line with the quantity still available for return"""
    sale_item_id: int
    product_id: int
    product_name: str
    unit_type: Optional[str] = None
    is_loose: bool = False
    unit_price: Decimal
    line_total: Decimal
    sold_quantity: Decimal
    returned_quantity: Decimal
    returnable_quantity: Decimal


class ReturnableSale(BaseModel):
    """Return/void eligibility of a sale for the current user"""
    sale_id: int
    sale_no: str
    sale_date: datetime
    invoice_no: Optional[str] = None
    status: str
    payment_mode: Optional[str] = None
    total_amount: Decimal
    returned_amount: Decimal
    days_since_sale: int
    return_window_days: int
    within_window: bool
    can_return: bool
    return_block_reason: Optional[str] = None
    can_void: bool
    void_block_reason: Optional[str] = None
    void_reason: Optional[str] = None
    voided_at: Optional[datetime] = None
    items: List[ReturnableItem]
    returns: List[SaleReturnResponse] = []
