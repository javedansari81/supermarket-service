"""
GST item schemas
"""
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel


class GstItemResponse(BaseModel):
    """GST item with the tenant category it is listed under"""
    id: int
    item_name: str
    hsn_code: str
    gst_percent_loose: Decimal
    gst_percent_packed: Decimal
    category_id: Optional[int] = None
    category_name: Optional[str] = None
