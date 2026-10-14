"""
Category schemas
"""
from typing import Optional, List, Literal
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from app.schemas.base import TimestampSchema


class CategoryGstFields(BaseModel):
    """HSN and GST % filled into new products of the category"""
    hsn_code: Optional[str] = None
    gst_percent_loose: Optional[Decimal] = Field(None, ge=0, le=100)
    gst_percent_packed: Optional[Decimal] = Field(None, ge=0, le=100)

    @field_validator("hsn_code", mode="before")
    @classmethod
    def validate_hsn_code(cls, v):
        if isinstance(v, str):
            v = v.strip() or None
        if v is not None and not (v.isdigit() and 4 <= len(v) <= 8):
            raise ValueError("HSN code must be 4 to 8 digits")
        return v


class CategoryBase(CategoryGstFields):
    """Base category schema"""
    category_name: str
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    """Schema for creating a category"""
    pass


class CategoryUpdate(CategoryGstFields):
    """Schema for updating a category"""
    category_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


class CategoryResponse(CategoryBase, TimestampSchema):
    """Schema for category response"""
    id: int
    tenant_id: int
    status: str


class CategoryListResponse(BaseModel):
    """Schema for category list response"""
    items: List[CategoryResponse]
    total: int
    page: int
    page_size: int

