"""
Stock movement schemas
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class StockMovementCreate(BaseModel):
    """Schema for creating a stock movement"""
    product_id: int
    movement_type: str
    quantity: Decimal
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    remarks: Optional[str] = None


class StockMovementResponse(BaseModel):
    """Schema for stock movement response"""
    id: int
    tenant_id: int
    product_id: int
    product_name: Optional[str] = None
    movement_type: str
    quantity: Decimal
    reference_type: Optional[str]
    reference_id: Optional[int]
    remarks: Optional[str]
    created_at: datetime
    created_by: Optional[int]
    
    model_config = {"from_attributes": True}


class StockMovementListResponse(BaseModel):
    """Schema for stock movement list response"""
    items: List[StockMovementResponse]
    total: int
    page: int
    page_size: int


class StockAdjustment(BaseModel):
    """Schema for stock adjustment"""
    product_id: int
    adjustment_type: str  # adjustment_in, adjustment_out, damage_out, expired_out
    quantity: Decimal = Field(..., gt=0, max_digits=12, decimal_places=3)
    remarks: Optional[str] = None


class StockSummary(BaseModel):
    """Schema for stock summary"""
    id: int
    product_id: int
    product_no: str
    product_name: str
    barcode: Optional[str] = None
    category_name: Optional[str]
    current_stock: Decimal
    stock_quantity: Decimal
    reorder_level: Decimal
    unit_type: str
    is_low_stock: bool


class StockReport(BaseModel):
    """Schema for stock report"""
    items: List[StockSummary]
    total_products: int
    low_stock_count: int
    out_of_stock_count: int

