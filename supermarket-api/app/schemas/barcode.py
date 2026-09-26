"""
Barcode schemas
"""
from typing import Optional, List
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator
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
    """Schema for barcode print request. With batch_id (single product) the labels carry the
    batch barcode and the batch's MRP, so a scan identifies the batch."""
    product_ids: List[int] = Field(..., min_length=1)
    copies: int = Field(1, ge=1, le=500)
    config_id: Optional[int] = None
    batch_id: Optional[int] = None

    @model_validator(mode="after")
    def check_batch_single_product(self):
        if self.batch_id and len(self.product_ids) != 1:
            raise ValueError("A batch label must be for a single product")
        return self


class BarcodeLabelData(BaseModel):
    """Schema for barcode label data"""
    store_name: str
    product_no: str
    product_name: str
    barcode: str
    mrp: str
    selling_price: Optional[str] = None
    unit_type: Optional[str] = None
    is_loose: bool = False
    barcode_image: str  # Base64 encoded image


class PackedLabelRequest(BaseModel):
    """Schema for a packed-goods (Legal Metrology) label print request. Net quantity and MRP
    come from the product; with batch_id the label uses the batch barcode and MRP, and batch
    number and best before default to the batch's."""
    product_id: int
    batch_id: Optional[int] = None
    packed_date: date
    best_before_date: Optional[date] = None
    batch_no: Optional[str] = Field(None, max_length=30)
    copies: int = Field(1, ge=1, le=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.best_before_date and self.best_before_date < self.packed_date:
            raise ValueError("Best before date cannot be earlier than packed date")
        return self


class PackedLabelData(BaseModel):
    """Schema for packed-goods label data"""
    store_name: str
    store_address: str = ""
    store_phone: str = ""
    store_email: str = ""
    fssai_license: str = ""
    product_name: str
    barcode: str
    barcode_image: str
    net_quantity: str
    mrp: str
    unit_sale_price: Optional[str] = None
    packed_date: str
    best_before_date: Optional[str] = None
    batch_no: Optional[str] = None

