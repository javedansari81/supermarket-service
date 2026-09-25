"""
Purchase schemas
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field
from app.schemas.base import TimestampSchema


class PurchaseItemCreate(BaseModel):
    """Schema for creating a purchase item"""
    product_id: int
    quantity: Decimal = Field(..., gt=0, max_digits=12, decimal_places=3)
    unit_cost: Decimal = Field(..., ge=0, max_digits=10, decimal_places=2)


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
    items: List[PurchaseItemCreate] = Field(..., min_length=1)


class PurchaseUpdate(BaseModel):
    """Schema for updating a purchase; when items are sent they replace the existing lines"""
    supplier_id: Optional[int] = None
    supplier_invoice_no: Optional[str] = Field(None, max_length=100)
    purchase_date: Optional[date] = None
    remarks: Optional[str] = None
    items: Optional[List[PurchaseItemCreate]] = Field(None, min_length=1)


class PurchaseCancel(BaseModel):
    """Schema for cancelling a purchase"""
    reason: Optional[str] = Field(None, max_length=500)


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
    bill_file_name: Optional[str] = None
    bill_content_type: Optional[str] = None
    bill_uploaded_at: Optional[datetime] = None
    supplier: Optional[SupplierBrief] = None
    items: List[PurchaseItemResponse] = []

    @computed_field
    @property
    def supplier_name(self) -> Optional[str]:
        return self.supplier.supplier_name if self.supplier else None


class PurchaseBillUrl(BaseModel):
    """Temporary link for viewing a purchase's supplier bill"""
    url: str
    file_name: str
    content_type: str
    expires_in: int


class PurchaseListResponse(BaseModel):
    """Schema for purchase list response"""
    items: List[PurchaseResponse]
    total: int
    page: int
    page_size: int

