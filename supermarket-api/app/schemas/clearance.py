"""
Near-expiry (clearance) discount schemas
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class ClearanceTier(BaseModel):
    """percent off once days_left to expiry is at or below days_left"""
    days_left: int = Field(ge=0, le=730)
    percent: Decimal = Field(gt=0, le=100)


class ClearanceTiersIn(BaseModel):
    """Tiers for a rule; an empty list means no near-expiry discount for this scope"""
    tiers: List[ClearanceTier] = Field(default_factory=list, max_length=10)

    @field_validator("tiers")
    @classmethod
    def unique_days(cls, v: List[ClearanceTier]) -> List[ClearanceTier]:
        if len({t.days_left for t in v}) != len(v):
            raise ValueError("Each tier needs a different number of days left")
        return sorted(v, key=lambda t: t.days_left, reverse=True)


class ClearanceRuleResponse(BaseModel):
    id: Optional[int] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    tiers: List[ClearanceTier] = []


class ClearanceRulesResponse(BaseModel):
    """Store default plus category and product rules"""
    enabled: bool
    default: ClearanceRuleResponse
    categories: List[ClearanceRuleResponse] = []
    products: List[ClearanceRuleResponse] = []


class ClearanceSettingsIn(BaseModel):
    enabled: bool


class MarkdownIn(BaseModel):
    """Today's markdown for a loose item; 0 removes it"""
    percent: Decimal = Field(ge=0, le=100)


class NearExpiryBatch(BaseModel):
    batch_id: int
    product_id: int
    product_name: str
    category_name: Optional[str] = None
    batch_no: Optional[str] = None
    mrp: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    expiry_date: date
    days_left: int
    quantity_left: Decimal
    clearance_percent: Decimal


class LooseMarkdownItem(BaseModel):
    product_id: int
    product_name: str
    category_name: Optional[str] = None
    unit_type: Optional[str] = None
    selling_price: Optional[Decimal] = None
    stock_quantity: Decimal
    markdown_percent: Decimal = Decimal("0")
    markdown_until: Optional[datetime] = None


class NearExpiryResponse(BaseModel):
    """In-stock packed batches expiring within `days` (expired ones too) and loose items"""
    enabled: bool
    days: int
    batches: List[NearExpiryBatch] = []
    loose_items: List[LooseMarkdownItem] = []
