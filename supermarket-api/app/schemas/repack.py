"""
Repack schemas: loose stock packed into own-packed products
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class RepackItemIn(BaseModel):
    """Number of packs made of one own-packed product"""
    product_id: int
    pack_count: int = Field(..., gt=0, le=100000)


class RepackCreate(BaseModel):
    """Repack loose stock. Wastage is recorded by default; without wastage_quantity the
    recommended wastage (store setting, % of packed weight) is used."""
    source_product_id: int
    items: List[RepackItemIn] = Field(..., min_length=1)
    wastage_enabled: bool = True
    wastage_quantity: Optional[Decimal] = Field(None, ge=0, le=100000)
    expiry_date: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=500)

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: List[RepackItemIn]) -> List[RepackItemIn]:
        ids = [i.product_id for i in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each pack product can be listed once")
        return items


class RepackPackOption(BaseModel):
    """Own-packed product that can be made from the loose product"""
    product_id: int
    product_name: str
    net_quantity: Decimal
    net_unit: str
    # Loose quantity one pack uses, in the loose product's unit
    source_quantity_per_pack: Decimal
    mrp: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    stock_quantity: Decimal


class RepackSourceResponse(BaseModel):
    """Loose product with the packs it can be packed into"""
    product_id: int
    product_name: str
    unit_type: str
    stock_quantity: Decimal
    purchase_price: Optional[Decimal] = None
    wastage_percent: Decimal
    packs: List[RepackPackOption]


class RepackItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    batch_id: Optional[int] = None
    pack_count: int
    source_quantity: Decimal
    unit_cost: Optional[Decimal] = None


class RepackResponse(BaseModel):
    id: int
    repack_no: str
    source_product_id: int
    source_product_name: Optional[str] = None
    unit_type: Optional[str] = None
    packed_quantity: Decimal
    wastage_enabled: bool
    wastage_quantity: Decimal
    total_quantity: Decimal
    source_unit_cost: Optional[Decimal] = None
    expiry_date: Optional[date] = None
    remarks: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None
    items: List[RepackItemResponse]


class RepackListResponse(BaseModel):
    items: List[RepackResponse]
    total: int
    page: int
    page_size: int
