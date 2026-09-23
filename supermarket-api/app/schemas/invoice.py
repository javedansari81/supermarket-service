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
    store_state: Optional[str] = None
    store_fssai: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_gstin: Optional[str] = None
    place_of_supply: Optional[str] = None
    subtotal: Optional[Decimal] = Decimal("0")
    tax_amount: Optional[Decimal] = Decimal("0")
    cgst_amount: Optional[Decimal] = Decimal("0")
    sgst_amount: Optional[Decimal] = Decimal("0")
    igst_amount: Optional[Decimal] = Decimal("0")
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


class HsnSummaryRow(BaseModel):
    """GST summary row grouped by HSN code and rate"""
    hsn_code: str
    tax_percent: float
    taxable_value: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    tax_amount: float


class InvoicePrintData(BaseModel):
    """Schema for invoice print data (for thermal printer)"""
    invoice_id: int
    store_name: str
    store_address: Optional[str] = None
    store_phone: Optional[str] = None
    store_gstin: Optional[str] = None
    store_state: Optional[str] = None
    store_state_code: Optional[str] = None
    store_fssai: Optional[str] = None
    invoice_no: str
    invoice_date: str
    sale_no: Optional[str] = None
    cashier_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_gstin: Optional[str] = None
    place_of_supply: Optional[str] = None
    is_interstate: bool = False
    items: List[dict]
    hsn_summary: List[HsnSummaryRow] = []
    subtotal: float
    tax_amount: float
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    discount_amount: float
    total_amount: float
    mrp_savings: float = 0
    tax_inclusive: bool = True
    payment_mode: str
    footer_text: Optional[str] = None
    is_duplicate: bool = False

