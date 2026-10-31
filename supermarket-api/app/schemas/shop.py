"""
Online shop catalogue schemas (public, no login). Never include purchase prices or exact stock.
"""
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class ShopStore(BaseModel):
    store: str
    store_name: str
    store_address: str = ""


class ShopStoreListResponse(BaseModel):
    items: List[ShopStore]


class ShopStoreDetail(ShopStore):
    store_phone: str = ""
    store_email: str = ""
    gstin: str = ""
    fssai_license: str = ""
    # Online orders below free_delivery_min pay delivery_charge
    delivery_charge: Decimal = Decimal("0")
    free_delivery_min: Decimal = Decimal("0")
    # Pincodes the store delivers to; empty = not delivering yet
    delivery_pincodes: List[str] = []


class ShopCategory(BaseModel):
    id: int
    category_name: str
    product_count: int


class ShopCategoryListResponse(BaseModel):
    items: List[ShopCategory]


class ShopProduct(BaseModel):
    """Price for one unit (one pack, or one kg / L for loose items), worked out as billing does
    for the stock that would be sold first. The final bill is made when the order is packed."""
    id: int
    product_name: str
    brand: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    is_loose: bool
    unit_type: Optional[str] = None
    net_quantity: Optional[Decimal] = None
    net_unit: Optional[str] = None
    mrp: Optional[Decimal] = None
    price: Decimal
    offer_price: Decimal
    discount_percent: Decimal = Decimal("0")
    # "offer" or "clearance" when offer_price is lower than price
    discount_source: Optional[str] = None
    offer_name: Optional[str] = None
    in_stock: bool
    # 800 px and 320 px pictures (absolute, or a path under the API base address); None = no picture
    image_url: Optional[str] = None
    thumb_url: Optional[str] = None
    # Every pack size of the same item (this one included), smallest first; empty when only one
    pack_sizes: List["ShopProduct"] = []


class ShopProductDetail(ShopProduct):
    description: Optional[str] = None


class ShopProductListResponse(BaseModel):
    items: List[ShopProduct]
    total: int
    page: int
    page_size: int
