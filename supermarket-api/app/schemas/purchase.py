"""
Purchase schemas
"""
from typing import Optional, List
from datetime import date
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.base import TimestampSchema


class PurchaseItemCreate(BaseModel):
    """Schema for creating a purchase item"""
    product_id: int
    quantity: Decimal
    unit_cost: Decimal


class PurchaseItemResponse(BaseModel):
    """Schema for purchase item response"""
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    
    model_config = {"from_attributes": True}


class PurchaseBase(BaseModel):
    """Base purchase schema"""
    supplier_id: Optional[int] = None
    supplier_invoice_no: Optional[str] = None
    purchase_date: date
    remarks: Optional[str] = None


class PurchaseCreate(PurchaseBase):
    """Schema for creating a purchase"""
    items: List[PurchaseItemCreate]


class PurchaseUpdate(BaseModel):
    """Schema for updating a purchase"""
    supplier_id: Optional[int] = None
    supplier_invoice_no: Optional[str] = None
    purchase_date: Optional[date] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class SupplierBrief(BaseModel):
    """Brief supplier info for purchase response"""
    id: int
    supplier_code: str
    supplier_name: str
    
    model_config = {"from_attributes": True}


class PurchaseResponse(PurchaseBase, TimestampSchema):
    """Schema for purchase response"""
    id: int
    tenant_id: int
    purchase_no: str
    total_amount: Decimal
    status: str
    supplier: Optional[SupplierBrief] = None
    items: List[PurchaseItemResponse] = []


class PurchaseListResponse(BaseModel):
    """Schema for purchase list response"""
    items: List[PurchaseResponse]
    total: int
    page: int
    page_size: int

