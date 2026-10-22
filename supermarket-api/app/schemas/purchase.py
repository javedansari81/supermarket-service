"""
Purchase schemas
"""
from typing import Optional, List, Literal, Annotated
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field, field_validator, model_validator
from app.schemas.base import TimestampSchema

BillType = Literal["gst_invoice", "no_gst"]
BillTotal = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
GstPercent = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]


class PurchaseItemCreate(BaseModel):
    """Schema for creating a purchase item. unit_cost is the rate per unit as on the bill
    (GST included). gst_percent is left out when the bill does not show it; that GST is not
    claimed. MRP / selling price default to the product's current prices; for packed items
    they decide which stock batch the quantity goes into."""
    product_id: int
    quantity: Decimal = Field(..., gt=0, max_digits=12, decimal_places=3)
    unit_cost: Decimal = Field(..., ge=0, max_digits=10, decimal_places=2)
    hsn_code: Optional[str] = Field(None, pattern=r"^[0-9]{4,8}$")
    gst_percent: Optional[GstPercent] = None
    mrp: Optional[Decimal] = Field(None, ge=0)
    selling_price: Optional[Decimal] = Field(None, ge=0)
    expiry_date: Optional[date] = None
    batch_no: Optional[str] = Field(None, max_length=50)

    @field_validator("hsn_code", mode="before")
    @classmethod
    def blank_hsn_to_none(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v

    @model_validator(mode="after")
    def check_price_not_above_mrp(self):
        if self.mrp is not None and self.selling_price is not None and self.selling_price > self.mrp:
            raise ValueError("Selling price cannot be greater than MRP")
        return self


class PurchaseItemResponse(BaseModel):
    """Schema for purchase item response"""
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    rate: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    hsn_code: Optional[str] = None
    gst_percent: Optional[Decimal] = None
    taxable_value: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    itc_eligible: bool = False
    batch_id: Optional[int] = None
    batch_no: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    expiry_date: Optional[date] = None

    model_config = {"from_attributes": True}


class PurchaseBase(BaseModel):
    """Base purchase schema"""
    supplier_id: Optional[int] = None
    supplier_invoice_no: Optional[str] = None
    purchase_date: date
    remarks: Optional[str] = None


class PurchaseCreate(PurchaseBase):
    """Schema for creating a purchase. bill_type defaults to 'gst_invoice' when the supplier
    has a GSTIN, else 'no_gst'. bill_total is the grand total on the bill; it may differ from
    the sum of line amounts by at most Rs 1 (saved as round-off)."""
    bill_type: Optional[BillType] = None
    bill_total: Optional[BillTotal] = None
    items: List[PurchaseItemCreate] = Field(..., min_length=1)


class PurchaseUpdate(BaseModel):
    """Schema for updating a purchase; when items are sent they replace the existing lines.
    Without items, a change of supplier, bill type or bill total recalculates the existing lines."""
    supplier_id: Optional[int] = None
    supplier_invoice_no: Optional[str] = Field(None, max_length=100)
    purchase_date: Optional[date] = None
    remarks: Optional[str] = None
    bill_type: Optional[BillType] = None
    bill_total: Optional[BillTotal] = None
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
    bill_type: str
    supplier_gstin: Optional[str] = None
    is_interstate: bool = False
    taxable_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    round_off: Decimal = Decimal("0")
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

