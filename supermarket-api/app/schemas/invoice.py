"""
Invoice schemas
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class InvoiceCreate(BaseModel):
    """Schema for creating an invoice"""
    sale_id: int
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


class InvoiceResponse(BaseModel):
    """Schema for invoice response"""
    id: int
    tenant_id: int
    sale_id: int
    invoice_no: str
    invoice_date: datetime
    store_name: Optional[str] = None
    store_address: Optional[str] = None
    store_contact: Optional[str] = None
    store_gst: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    subtotal: Optional[Decimal] = Decimal("0")
    tax_amount: Optional[Decimal] = Decimal("0")
    discount_amount: Optional[Decimal] = Decimal("0")
    total_amount: Optional[Decimal] = Decimal("0")
    payment_mode: Optional[str] = None
    footer_message: Optional[str] = None
    printed_count: Optional[int] = 0
    last_printed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoicePrintRequest(BaseModel):
    """Schema for invoice print request"""
    invoice_id: int


class InvoiceListResponse(BaseModel):
    """Schema for invoice list response"""
    items: List[InvoiceResponse]
    total: int
    page: int
    page_size: int


class InvoicePrintData(BaseModel):
    """Schema for invoice print data (for thermal printer)"""
    store_name: str
    store_address: Optional[str] = None
    store_phone: Optional[str] = None
    store_gstin: Optional[str] = None
    invoice_no: str
    invoice_date: str
    cashier_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: List[dict]
    subtotal: float
    tax_amount: float
    discount_amount: float
    total_amount: float
    payment_mode: str
    footer_text: Optional[str] = None

