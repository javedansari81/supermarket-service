"""
Settings schemas
"""
from typing import Optional, List
from pydantic import BaseModel


class SettingBase(BaseModel):
    """Base setting schema"""
    setting_key: str
    setting_value: Optional[str] = None
    setting_type: Optional[str] = "string"
    setting_category: Optional[str] = None
    description: Optional[str] = None


class SettingCreate(SettingBase):
    """Schema for creating a setting"""
    pass


class SettingUpdate(BaseModel):
    """Schema for updating a setting"""
    setting_value: Optional[str] = None
    setting_type: Optional[str] = None
    description: Optional[str] = None


class SettingResponse(BaseModel):
    """Schema for setting response"""
    id: int
    tenant_id: int
    setting_key: str
    setting_value: Optional[str] = None
    setting_type: Optional[str] = "string"
    setting_category: Optional[str] = None
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class SettingsListResponse(BaseModel):
    """Schema for setting list response"""
    items: List[SettingResponse]


class SettingsBulkUpdate(BaseModel):
    """Schema for bulk settings update"""
    settings: List[SettingCreate]


class StoreSettings(BaseModel):
    """Schema for store settings"""
    store_name: Optional[str] = ""
    store_address: Optional[str] = ""
    store_phone: Optional[str] = ""
    store_email: Optional[str] = ""
    gstin: Optional[str] = ""


class BillingSettings(BaseModel):
    """Schema for billing settings"""
    currency_symbol: Optional[str] = "₹"
    tax_inclusive_pricing: bool = False
    default_tax_percent: float = 0
    invoice_prefix: Optional[str] = "INV"
    invoice_footer: Optional[str] = "Thank you for shopping!"

