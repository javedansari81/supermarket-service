"""
Settings schemas
"""
import re
from typing import Optional, List
from pydantic import BaseModel, field_validator

GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

GST_STATE_CODES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}


def state_code_for(gstin: Optional[str], state_name: Optional[str] = None) -> str:
    """State code from GSTIN, falling back to the state name"""
    if gstin and len(gstin) >= 2 and gstin[:2] in GST_STATE_CODES:
        return gstin[:2]
    for code, name in GST_STATE_CODES.items():
        if state_name and name.lower() == state_name.strip().lower():
            return code
    return ""


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
    store_state: Optional[str] = ""
    store_state_code: Optional[str] = ""
    fssai_license: Optional[str] = ""

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v: Optional[str]) -> str:
        v = (v or "").strip().upper()
        if v and not GSTIN_PATTERN.match(v):
            raise ValueError("Invalid GSTIN format (15 characters, e.g. 27ABCDE1234F1Z5)")
        return v

    @field_validator("fssai_license")
    @classmethod
    def validate_fssai(cls, v: Optional[str]) -> str:
        v = (v or "").strip()
        if v and not re.fullmatch(r"[0-9]{14}", v):
            raise ValueError("FSSAI licence number must be 14 digits")
        return v


class BillingSettings(BaseModel):
    """Schema for billing settings"""
    currency_symbol: Optional[str] = "₹"
    tax_inclusive_pricing: bool = True
    default_tax_percent: float = 0
    invoice_prefix: Optional[str] = "INV"
    invoice_footer: Optional[str] = "Thank you for shopping!"

