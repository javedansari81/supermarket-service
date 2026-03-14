"""
Barcode schemas
"""
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.base import TimestampSchema


class BarcodeConfigBase(BaseModel):
    """Base barcode config schema"""
    config_name: str
    barcode_format: Optional[str] = "code128"
    label_width: Optional[Decimal] = Decimal("50")
    label_height: Optional[Decimal] = Decimal("30")
    show_store_name: Optional[bool] = True
    show_product_no: Optional[bool] = True
    show_mrp: Optional[bool] = True
    show_barcode: Optional[bool] = True
    font_size: Optional[int] = 10
    is_default: Optional[bool] = False


class BarcodeConfigCreate(BarcodeConfigBase):
    """Schema for creating a barcode config"""
    pass


class BarcodeConfigUpdate(BaseModel):
    """Schema for updating a barcode config"""
    config_name: Optional[str] = None
    barcode_format: Optional[str] = None
    label_width: Optional[Decimal] = None
    label_height: Optional[Decimal] = None
    show_store_name: Optional[bool] = None
    show_product_no: Optional[bool] = None
    show_mrp: Optional[bool] = None
    show_barcode: Optional[bool] = None
    font_size: Optional[int] = None
    is_default: Optional[bool] = None


class BarcodeConfigResponse(BarcodeConfigBase, TimestampSchema):
    """Schema for barcode config response"""
    id: int
    tenant_id: int


class BarcodeConfigListResponse(BaseModel):
    """Schema for barcode config list response"""
    items: List[BarcodeConfigResponse]


class BarcodePrintRequest(BaseModel):
    """Schema for barcode print request"""
    product_ids: List[int]
    copies: int = 1
    config_id: Optional[int] = None


class BarcodeLabelData(BaseModel):
    """Schema for barcode label data"""
    store_name: str
    product_no: str
    product_name: str
    barcode: str
    mrp: str
    barcode_image: str  # Base64 encoded image

