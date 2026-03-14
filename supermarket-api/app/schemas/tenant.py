"""
Tenant schemas
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.schemas.base import BaseSchema, TimestampSchema


class TenantBase(BaseModel):
    """Base tenant schema"""
    tenant_code: str
    tenant_name: str
    address: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    gst_no: Optional[str] = None


class TenantCreate(TenantBase):
    """Schema for creating a tenant"""
    pass


class TenantUpdate(BaseModel):
    """Schema for updating a tenant"""
    tenant_name: Optional[str] = None
    address: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    gst_no: Optional[str] = None
    status: Optional[str] = None


class TenantResponse(TenantBase, TimestampSchema):
    """Schema for tenant response"""
    id: int
    status: str


class TenantListResponse(BaseModel):
    """Schema for tenant list response"""
    items: List[TenantResponse]
    total: int
    page: int
    page_size: int

