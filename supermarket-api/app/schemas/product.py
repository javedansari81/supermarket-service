"""
Product schemas
"""
from typing import Optional, List, Literal
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator
from app.schemas.base import TimestampSchema
from app.schemas.category import CategoryResponse
from app.schemas.store_location import ProductLocationIn, ProductLocationResponse

NetUnit = Literal["g", "kg", "ml", "L", "pcs", "pages"]
ProductType = Literal["manufacturer", "own_packed", "loose"]


class ProductBase(BaseModel):
    """Base product schema"""
    product_no: Optional[str] = None
    # Sent with item_name = display name set by hand; sent alone = item name (older clients)
    product_name: Optional[str] = Field(None, min_length=1)
    item_name: Optional[str] = Field(None, min_length=1)
    category_id: Optional[int] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Optional[Decimal] = Field(Decimal("0"), ge=0, le=100)
    unit_type: Optional[str] = "pcs"
    is_loose: bool = False
    product_type: Optional[ProductType] = None
    hsn_code: Optional[str] = None
    gst_item_id: Optional[int] = None
    net_quantity: Optional[Decimal] = Field(None, gt=0)
    net_unit: Optional[NetUnit] = None
    reorder_level: Optional[Decimal] = Field(Decimal("0"), ge=0)
    expiry_date: Optional[date] = None
    description: Optional[str] = None


class ProductCreate(ProductBase):
    """Schema for creating a product"""
    stock_quantity: Optional[Decimal] = Field(Decimal("0"), ge=0)
    locations: Optional[List[ProductLocationIn]] = None

    @model_validator(mode="after")
    def check_price_not_above_mrp(self):
        if self.mrp is not None and self.selling_price is not None and self.selling_price > self.mrp:
            raise ValueError("Selling price cannot be greater than MRP")
        return self

    @model_validator(mode="after")
    def check_name_given(self):
        if not (self.item_name or self.product_name or "").strip():
            raise ValueError("Item name is required")
        return self


class ProductUpdate(BaseModel):
    """Schema for updating a product"""
    product_name: Optional[str] = Field(None, min_length=1)
    item_name: Optional[str] = Field(None, min_length=1)
    category_id: Optional[int] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    tax_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    unit_type: Optional[str] = None
    is_loose: Optional[bool] = None
    product_type: Optional[ProductType] = None
    hsn_code: Optional[str] = None
    gst_item_id: Optional[int] = None
    net_quantity: Optional[Decimal] = Field(None, gt=0)
    net_unit: Optional[NetUnit] = None
    reorder_level: Optional[Decimal] = Field(None, ge=0)
    expiry_date: Optional[date] = None
    description: Optional[str] = None
    status: Optional[str] = None
    locations: Optional[List[ProductLocationIn]] = None


class ProductResponse(ProductBase, TimestampSchema):
    """Schema for product response"""
    id: int
    tenant_id: int
    product_no: str
    product_name: str
    name_is_custom: bool = False
    gst_overridden: bool = False
    product_type: str
    plu_code: Optional[int] = None
    stock_quantity: Decimal
    status: str
    category: Optional[CategoryResponse] = None
    locations: List[ProductLocationResponse] = []


class ProductListResponse(BaseModel):
    """Schema for product list response"""
    items: List[ProductResponse]
    total: int
    page: int
    page_size: int


class ProductBatchResponse(BaseModel):
    """Stock batch of a packed product"""
    id: int
    product_id: int
    batch_no: Optional[str] = None
    barcode: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    purchase_price: Optional[Decimal] = None
    expiry_date: Optional[date] = None
    quantity_received: Decimal
    quantity_left: Decimal
    purchase_id: Optional[int] = None

    model_config = {"from_attributes": True}


class ProductBatchUpdate(BaseModel):
    """Correct the price or expiry of a batch"""
    batch_no: Optional[str] = Field(None, max_length=50)
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    expiry_date: Optional[date] = None


class ProductSearchResponse(BaseModel):
    """Schema for product search (barcode scan). batch_id is set when a batch barcode was scanned."""
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
    product_type: str = "own_packed"
    plu_code: Optional[int] = None
    hsn_code: Optional[str] = None
    locations: List[ProductLocationResponse] = []
    batch_id: Optional[int] = None
    batches: List[ProductBatchResponse] = []
    # Weight read from a scale label, in the product's unit
    scanned_quantity: Optional[Decimal] = None

