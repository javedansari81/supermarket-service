"""
Sale schemas
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.base import TimestampSchema


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
    quantity: Decimal
    unit_price: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
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
    remarks: Optional[str] = None


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
    remarks: Optional[str]
    status: str
    items: List[SaleItemResponse] = []
    cashier_name: Optional[str] = None


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

