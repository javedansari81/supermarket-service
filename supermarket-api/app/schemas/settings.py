"""
Settings schemas
"""
import re
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.core.upi import UPI_ID_PATTERN

GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
RAZORPAY_KEY_ID_PATTERN = re.compile(r"^rzp_(test|live)_[A-Za-z0-9]{8,40}$")

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
    default_tax_percent: float = Field(0, ge=0, le=100)
    invoice_prefix: Optional[str] = "INV"
    invoice_footer: Optional[str] = "Thank you for shopping!"
    # Billing, returns and voids need an open cash drawer shift
    shift_required: bool = False
    # Closing difference (Rs, either way) above which a supervisor or admin must approve
    shift_variance_limit: Decimal = Field(Decimal("100"), ge=0, le=100000, max_digits=8, decimal_places=2)
    # Card offered as a payment / refund mode at billing (needs a card machine)
    card_payments_enabled: bool = False
    # Read only: the store has a UPI ID (Settings > Payments), so billing shows a QR code
    upi_configured: bool = False


class UpiQrResponse(BaseModel):
    """UPI payment QR code for an amount; qr_image is a base64 PNG"""
    payee_name: str
    amount: Decimal
    qr_image: str


class PaymentSettingsUpdate(BaseModel):
    """Store payment accounts (admin only). Razorpay secrets: None = keep the saved one,
    "" = remove it, otherwise replace it."""
    # Store UPI ID for the payment QR code at billing; empty = no QR code
    upi_id: str = Field("", max_length=100)
    # Name shown in the customer's UPI app; empty = store name
    upi_payee_name: str = Field("", max_length=50)
    # Razorpay (not used yet; kept for online payments later)
    razorpay_key_id: str = Field("", max_length=50)
    razorpay_key_secret: Optional[str] = Field(None, max_length=100)
    razorpay_webhook_secret: Optional[str] = Field(None, max_length=100)

    @field_validator("upi_id")
    @classmethod
    def validate_upi_id(cls, v: Optional[str]) -> str:
        v = (v or "").strip()
        if v and not UPI_ID_PATTERN.match(v):
            raise ValueError("Invalid UPI ID (e.g. mfmart@okicici)")
        return v

    @field_validator("upi_payee_name")
    @classmethod
    def strip_payee_name(cls, v: Optional[str]) -> str:
        return (v or "").strip()

    @field_validator("razorpay_key_id")
    @classmethod
    def validate_key_id(cls, v: Optional[str]) -> str:
        v = (v or "").strip()
        if v and not RAZORPAY_KEY_ID_PATTERN.match(v):
            raise ValueError("Invalid Razorpay key ID (starts with rzp_test_ or rzp_live_)")
        return v

    @field_validator("razorpay_key_secret", "razorpay_webhook_secret")
    @classmethod
    def strip_secret(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else v.strip()


class PaymentSettingsResponse(BaseModel):
    """Store payment accounts as shown to admins: secrets are never returned, only whether
    they are saved"""
    upi_id: str = ""
    upi_payee_name: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret_set: bool = False
    razorpay_webhook_secret_set: bool = False
    # The server can save gateway secrets (PAYMENT_ENCRYPTION_KEY is set)
    encryption_configured: bool = False


class LoyaltySettings(BaseModel):
    """Loyalty points: earn_points_per_100 points per Rs 100 paid (not by points), each point
    worth point_value Rs when redeemed. expiry_days of no earn/redeem expires the balance
    (0 = never)."""
    enabled: bool = False
    earn_points_per_100: int = Field(1, ge=0, le=100)
    point_value: Decimal = Field(Decimal("1"), gt=0, le=100, max_digits=6, decimal_places=2)
    min_redeem_points: int = Field(100, ge=1)
    max_redeem_percent: int = Field(50, ge=1, le=100)
    expiry_days: int = Field(365, ge=0, le=3650)


class OnlineSettings(BaseModel):
    """Online ordering (customer shop): delivery_charge below free_delivery_min; orders are
    delivered only to delivery_pincodes (empty = the store takes no delivery orders)"""
    enabled: bool = False
    delivery_charge: Decimal = Field(Decimal("30"), ge=0, le=1000, max_digits=6, decimal_places=2)
    free_delivery_min: Decimal = Field(Decimal("300"), ge=0, le=100000, max_digits=8, decimal_places=2)
    delivery_pincodes: List[str] = Field(default_factory=list, max_length=200)

    @field_validator("delivery_pincodes")
    @classmethod
    def validate_pincodes(cls, v: List[str]) -> List[str]:
        cleaned: List[str] = []
        for code in (c.strip() for c in v):
            if not re.fullmatch(r"[1-9][0-9]{5}", code):
                raise ValueError(f"Invalid pincode: {code or '(blank)'}")
            if code not in cleaned:
                cleaned.append(code)
        return cleaned

