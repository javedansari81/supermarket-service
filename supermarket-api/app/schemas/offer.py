"""
Festival / promotional offer schemas
"""
from typing import Optional, List, Literal
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator


class OfferItemIn(BaseModel):
    """'percent' off, or 'amount' (Rs) off per unit (per kg for loose items)"""
    product_id: int
    discount_type: Literal["percent", "amount"]
    discount_value: Decimal = Field(gt=0, max_digits=10, decimal_places=2)

    @model_validator(mode="after")
    def percent_within_100(self):
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("Percent off cannot be more than 100")
        return self


class OfferIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date
    is_active: bool = True
    items: List[OfferItemIn] = Field(min_length=1, max_length=500)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Offer name is required")
        return v

    @model_validator(mode="after")
    def check_dates_and_products(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        if len({i.product_id for i in self.items}) != len(self.items):
            raise ValueError("A product can be added to an offer only once")
        return self


class OfferItemResponse(BaseModel):
    product_id: int
    product_name: str
    unit_type: Optional[str] = None
    is_loose: bool = False
    discount_type: str
    discount_value: Decimal
    selling_price: Optional[Decimal] = None
    purchase_price: Optional[Decimal] = None
    offer_price: Optional[Decimal] = None
    # Offer price is below the purchase cost (a warning; the offer still applies)
    below_cost: bool = False


class OfferResponse(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    is_active: bool
    # 'running', 'upcoming', 'ended' or 'inactive'
    status: str
    item_count: int = 0
    items: List[OfferItemResponse] = []


class OfferListResponse(BaseModel):
    items: List[OfferResponse]
