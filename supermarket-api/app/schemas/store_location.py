"""
Store location schemas
"""
from typing import Optional, List, Literal
from decimal import Decimal
from pydantic import BaseModel, Field
from app.schemas.base import TimestampSchema

LocationType = Literal["display", "storage", "promo"]


class StoreLocationBase(BaseModel):
    """Base store location schema"""
    location_type: LocationType = "display"
    floor: str = Field("Ground", min_length=1, max_length=20)
    rack_no: str = Field(..., min_length=1, max_length=10)
    shelf_no: Optional[str] = Field(None, max_length=5)
    description: Optional[str] = None


class StoreLocationCreate(StoreLocationBase):
    """Schema for creating a store location"""
    pass


class StoreLocationUpdate(BaseModel):
    """Schema for updating a store location"""
    location_type: Optional[LocationType] = None
    floor: Optional[str] = Field(None, min_length=1, max_length=20)
    rack_no: Optional[str] = Field(None, min_length=1, max_length=10)
    shelf_no: Optional[str] = Field(None, max_length=5)
    description: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


class StoreLocationResponse(StoreLocationBase, TimestampSchema):
    """Schema for store location response"""
    id: int
    tenant_id: int
    location_code: str
    status: str


class LocationSuggestion(BaseModel):
    """Suggested next rack / shelf for a location type"""
    location_type: LocationType
    rack_no: str
    shelf_no: str
    floor: Optional[str] = None
    existing_racks: List[str] = []


class StoreLocationListResponse(BaseModel):
    """Schema for store location list response"""
    items: List[StoreLocationResponse]
    total: int
    page: int
    page_size: int


class ProductLocationIn(BaseModel):
    """A location assigned to a product"""
    location_id: int
    is_primary: bool = False


class ProductLocationResponse(BaseModel):
    """A product's assigned location"""
    id: int
    location_id: int
    location_code: Optional[str] = None
    floor: Optional[str] = None
    role: str
    is_primary: bool

    model_config = {"from_attributes": True}


class LocationProduct(BaseModel):
    """A product assigned to a location"""
    product_id: int
    product_no: str
    product_name: str
    role: str
    is_primary: bool
    stock_quantity: Decimal


class PutawayItem(BaseModel):
    """A purchase line with the locations where it should be placed"""
    product_id: int
    product_no: str
    product_name: str
    quantity: Decimal
    locations: List[ProductLocationResponse] = []
