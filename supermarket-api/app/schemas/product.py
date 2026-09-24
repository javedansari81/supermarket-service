"""
Product schemas
"""
from typing import Optional, List
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator
from app.schemas.base import TimestampSchema
from app.schemas.category import CategoryResponse


class ProductBase(BaseModel):
    """Base product schema"""
    product_no: Optional[str] = None
    product_name: str = Field(..., min_length=1)
    category_id: Optional[int] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Optional[Decimal] = Field(Decimal("0"), ge=0, le=100)
    unit_type: Optional[str] = "pcs"
    is_loose: bool = False
    hsn_code: Optional[str] = None
    reorder_level: Optional[Decimal] = Field(Decimal("0"), ge=0)
    expiry_date: Optional[date] = None
    description: Optional[str] = None


class ProductCreate(ProductBase):
    """Schema for creating a product"""
    stock_quantity: Optional[Decimal] = Field(Decimal("0"), ge=0)

    @model_validator(mode="after")
    def check_price_not_above_mrp(self):
        if self.mrp is not None and self.selling_price is not None and self.selling_price > self.mrp:
            raise ValueError("Selling price cannot be greater than MRP")
        return self


class ProductUpdate(BaseModel):
    """Schema for updating a product"""
    product_name: Optional[str] = Field(None, min_length=1)
    category_id: Optional[int] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    unit_type: Optional[str] = None
    is_loose: Optional[bool] = None
    hsn_code: Optional[str] = None
    reorder_level: Optional[Decimal] = Field(None, ge=0)
    expiry_date: Optional[date] = None
    description: Optional[str] = None
    status: Optional[str] = None


class ProductResponse(ProductBase, TimestampSchema):
    """Schema for product response"""
    id: int
    tenant_id: int
    product_no: str
    stock_quantity: Decimal
    status: str
    category: Optional[CategoryResponse] = None


class ProductListResponse(BaseModel):
    """Schema for product list response"""
    items: List[ProductResponse]
    total: int
    page: int
    page_size: int


class ProductSearchResponse(BaseModel):
    """Schema for product search (barcode scan)"""
    id: int
    product_no: str
    product_name: str
    barcode: Optional[str]
    selling_price: Decimal
    mrp: Optional[Decimal]
    tax_percent: Decimal
    stock_quantity: Decimal
    unit_type: str
    is_loose: bool = False
    hsn_code: Optional[str] = None

