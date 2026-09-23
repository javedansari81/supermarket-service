"""
Supplier schemas
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator
from app.schemas.base import TimestampSchema
from app.schemas.settings import GSTIN_PATTERN


class SupplierFields(BaseModel):
    """Validation shared by supplier create/update"""

    @field_validator("contact_person", "contact_no", "email", "address", "gst_no",
                     mode="before", check_fields=False)
    @classmethod
    def blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("gst_no", check_fields=False)
    @classmethod
    def validate_gst_no(cls, v):
        if v is None:
            return v
        v = v.upper()
        if not GSTIN_PATTERN.match(v):
            raise ValueError("Invalid GSTIN (15 characters, e.g. 27ABCDE1234F1Z5)")
        return v


class SupplierBase(SupplierFields):
    """Base supplier schema"""
    supplier_code: str
    supplier_name: str
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_no: Optional[str] = None


class SupplierCreate(SupplierFields):
    """Schema for creating a supplier (supplier_code auto-generated when omitted)"""
    supplier_code: Optional[str] = Field(None, max_length=50)
    supplier_name: str = Field(..., min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_no: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = None
    gst_no: Optional[str] = None
    status: Literal["active", "inactive"] = "active"


class SupplierUpdate(SupplierFields):
    """Schema for updating a supplier"""
    supplier_name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_no: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = None
    gst_no: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


class SupplierResponse(TimestampSchema):
    """Schema for supplier response"""
    id: int
    tenant_id: int
    supplier_code: str
    supplier_name: str
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_no: Optional[str] = None
    status: str


class SupplierListResponse(BaseModel):
    """Schema for supplier list response"""
    items: List[SupplierResponse]
    total: int
    page: int
    page_size: int

