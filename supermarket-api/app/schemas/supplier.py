"""
Supplier schemas
"""
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.base import TimestampSchema


class SupplierBase(BaseModel):
    """Base supplier schema"""
    supplier_code: str
    supplier_name: str
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_no: Optional[str] = None


class SupplierCreate(SupplierBase):
    """Schema for creating a supplier"""
    pass


class SupplierUpdate(BaseModel):
    """Schema for updating a supplier"""
    supplier_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_no: Optional[str] = None
    status: Optional[str] = None


class SupplierResponse(SupplierBase, TimestampSchema):
    """Schema for supplier response"""
    id: int
    tenant_id: int
    status: str


class SupplierListResponse(BaseModel):
    """Schema for supplier list response"""
    items: List[SupplierResponse]
    total: int
    page: int
    page_size: int

