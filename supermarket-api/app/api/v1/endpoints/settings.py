"""
Settings management endpoints
"""
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import record_audit
from app.core.loyalty import get_loyalty_settings, loyalty_settings_values
from app.core.online_orders import (DELIVERY_CHARGE_KEY, DELIVERY_PINCODES_KEY,
                                    FREE_DELIVERY_MIN_KEY, delivery_pincodes, delivery_settings)
from app.core import encryption
from app.core.upi import qr_png_base64, upi_uri
from app.models.audit_log import AuditLog
from app.models.tenant_payment_settings import TenantPaymentSettings
from app.models.tenant_setting import TenantSetting
from app.models.tenant import Tenant
from app.schemas.settings import (
    SettingCreate, SettingUpdate, SettingResponse,
    SettingsListResponse, StoreSettings, BillingSettings, LoyaltySettings, OnlineSettings,
    UpiQrResponse, PaymentSettingsUpdate, PaymentSettingsResponse, state_code_for
)
from app.api.deps import (ONLINE_ORDERING_KEY, get_current_admin_user, get_tenant_context,
                          TenantContext)

router = APIRouter()


# Default settings configuration
DEFAULT_SETTINGS = {
    "store_name": {"value": "", "category": "store", "description": "Store name for invoices"},
    "store_address": {"value": "", "category": "store", "description": "Store address"},
    "store_phone": {"value": "", "category": "store", "description": "Store contact number"},
    "store_email": {"value": "", "category": "store", "description": "Store email"},
    "gstin": {"value": "", "category": "store", "description": "GST identification number"},
    "store_state": {"value": "", "category": "store", "description": "State of the store (place of supply)"},
    "fssai_license": {"value": "", "category": "store", "description": "FSSAI licence number"},
    "currency_symbol": {"value": "₹", "category": "billing", "description": "Currency symbol"},
    "tax_inclusive_pricing": {"value": "true", "category": "billing", "description": "Prices include tax"},
    "default_tax_percent": {"value": "0", "category": "billing", "description": "Default tax percentage"},
    "invoice_prefix": {"value": "INV", "category": "billing", "description": "Invoice number prefix"},
    "invoice_footer": {"value": "Thank you for shopping!", "category": "billing", "description": "Invoice footer text"},
    "clearance_enabled": {"value": "false", "category": "billing", "description": "Apply near-expiry discount tiers"},
    "shift_required": {"value": "false", "category": "billing", "description": "Billing needs an open cash drawer shift"},
    "shift_variance_limit": {"value": "100", "category": "billing", "description": "Shift closing difference needing approval (Rs)"},
    "card_payments_enabled": {"value": "false", "category": "billing", "description": "Card offered as a payment mode at billing"},
    "loyalty_enabled": {"value": "false", "category": "loyalty", "description": "Loyalty points enabled"},
    "loyalty_earn_points_per_100": {"value": "1", "category": "loyalty", "description": "Points earned per Rs 100 paid"},
    "loyalty_point_value": {"value": "1", "category": "loyalty", "description": "Rs value of one point"},
    "loyalty_min_redeem_points": {"value": "100", "category": "loyalty", "description": "Minimum points per redemption"},
    "loyalty_max_redeem_percent": {"value": "50", "category": "loyalty", "description": "Max % of a bill paid by points"},
    "loyalty_expiry_days": {"value": "365", "category": "loyalty", "description": "Days without activity before points expire (0 = never)"},
    "online_ordering_enabled": {"value": "false", "category": "online", "description": "Customers can order online"},
    "delivery_charge": {"value": "30", "category": "online", "description": "Delivery charge for online orders (Rs)"},
    "free_delivery_min": {"value": "300", "category": "online", "description": "Online order amount for free delivery (Rs)"},
    "delivery_pincodes": {"value": "", "category": "online", "description": "Pincodes for online delivery (comma-separated)"},
    "low_stock_threshold": {"value": "10", "category": "inventory", "description": "Low stock warning threshold"},
    "barcode_prefix": {"value": "", "category": "barcode", "description": "Barcode prefix"},
}


@router.get("", response_model=SettingsListResponse)
async def list_settings(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List all settings for current tenant
    """
    query = db.query(TenantSetting).filter(TenantSetting.tenant_id == context.tenant_id)
    
    if category:
        keys = [k for k, v in DEFAULT_SETTINGS.items() if v["category"] == category]
        query = query.filter(TenantSetting.setting_key.in_(keys))
    
    settings = query.order_by(TenantSetting.setting_key).all()
    
    return SettingsListResponse(
        items=[SettingResponse.model_validate(s) for s in settings]
    )


STORE_KEYS = ["store_name", "store_address", "store_phone", "store_email", "gstin", "store_state", "fssai_license"]
BILLING_KEYS = ["currency_symbol", "tax_inclusive_pricing", "default_tax_percent", "invoice_prefix", "invoice_footer",
                "shift_required", "shift_variance_limit", "card_payments_enabled"]


def get_settings_dict(db: Session, tenant_id: int, keys: List[str]) -> dict:
    """Get the given setting keys for a tenant as a dict"""
    settings = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key.in_(keys)
    ).all()
    return {s.setting_key: s.setting_value for s in settings}


def upsert_settings(db: Session, tenant_id: int, values: dict) -> None:
    """Create or update tenant settings"""
    for key, value in values.items():
        setting = db.query(TenantSetting).filter(
            TenantSetting.tenant_id == tenant_id,
            TenantSetting.setting_key == key
        ).first()
        if setting:
            setting.setting_value = value or ""
        else:
            db.add(TenantSetting(
                tenant_id=tenant_id,
                setting_key=key,
                setting_value=value or "",
                description=DEFAULT_SETTINGS.get(key, {}).get("description")
            ))


def build_store_settings(db: Session, tenant_id: int) -> StoreSettings:
    """Load store settings with tenant-name fallback; state code comes from GSTIN"""
    settings_dict = get_settings_dict(db, tenant_id, STORE_KEYS)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    gstin = settings_dict.get("gstin", "") or ""
    return StoreSettings(
        store_name=settings_dict.get("store_name") or (tenant.tenant_name if tenant else ""),
        store_address=settings_dict.get("store_address", ""),
        store_phone=settings_dict.get("store_phone", ""),
        store_email=settings_dict.get("store_email", ""),
        gstin=gstin,
        store_state=settings_dict.get("store_state", ""),
        store_state_code=state_code_for(gstin, settings_dict.get("store_state")),
        fssai_license=settings_dict.get("fssai_license", "")
    )


@router.get("/store", response_model=StoreSettings)
async def get_store_settings(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get store settings
    """
    return build_store_settings(db, context.tenant_id)


@router.put("/store", response_model=StoreSettings)
async def update_store_settings(
    store_settings: StoreSettings,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update store settings (admin only)
    """
    old_value = get_settings_dict(db, context.tenant_id, STORE_KEYS)
    new_value = {
        "store_name": store_settings.store_name,
        "store_address": store_settings.store_address,
        "store_phone": store_settings.store_phone,
        "store_email": store_settings.store_email,
        "gstin": store_settings.gstin,
        "store_state": store_settings.store_state,
        "fssai_license": store_settings.fssai_license
    }
    upsert_settings(db, context.tenant_id, new_value)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "setting", old_value=old_value, new_value=new_value)
    db.commit()
    return build_store_settings(db, context.tenant_id)


@router.get("/billing", response_model=BillingSettings)
async def get_billing_settings(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get billing settings
    """
    settings_dict = get_settings_dict(db, context.tenant_id, BILLING_KEYS)

    return BillingSettings(
        currency_symbol=settings_dict.get("currency_symbol", "₹"),
        tax_inclusive_pricing=settings_dict.get("tax_inclusive_pricing", "true").lower() == "true",
        default_tax_percent=float(settings_dict.get("default_tax_percent", "0")),
        invoice_prefix=settings_dict.get("invoice_prefix", "INV"),
        invoice_footer=settings_dict.get("invoice_footer", "Thank you for shopping!"),
        shift_required=(settings_dict.get("shift_required") or "false").lower() == "true",
        shift_variance_limit=settings_dict.get("shift_variance_limit") or "100",
        card_payments_enabled=(settings_dict.get("card_payments_enabled") or "false").lower() == "true",
        upi_configured=bool(getattr(_payment_row(db, context.tenant_id), "upi_id", ""))
    )


@router.put("/billing", response_model=BillingSettings)
async def update_billing_settings(
    billing_settings: BillingSettings,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update billing settings (admin only)
    """
    old_value = get_settings_dict(db, context.tenant_id, BILLING_KEYS)
    new_value = {
        "currency_symbol": billing_settings.currency_symbol,
        "tax_inclusive_pricing": str(billing_settings.tax_inclusive_pricing).lower(),
        "default_tax_percent": str(billing_settings.default_tax_percent),
        "invoice_prefix": billing_settings.invoice_prefix,
        "invoice_footer": billing_settings.invoice_footer,
        "shift_required": str(billing_settings.shift_required).lower(),
        "shift_variance_limit": str(billing_settings.shift_variance_limit),
        "card_payments_enabled": str(billing_settings.card_payments_enabled).lower()
    }
    upsert_settings(db, context.tenant_id, new_value)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "setting", old_value=old_value, new_value=new_value)
    db.commit()
    return billing_settings.model_copy(update={
        "upi_configured": bool(getattr(_payment_row(db, context.tenant_id), "upi_id", ""))
    })


# ---------- Payment accounts (UPI ID, Razorpay keys): own table, admins of the store only ----------

def _payment_row(db: Session, tenant_id: int, lock: bool = False) -> Optional[TenantPaymentSettings]:
    query = db.query(TenantPaymentSettings).filter(TenantPaymentSettings.tenant_id == tenant_id)
    if lock:
        query = query.with_for_update()
    return query.first()


def _payment_response(row: Optional[TenantPaymentSettings]) -> PaymentSettingsResponse:
    configured = encryption.is_configured()
    if row is None:
        return PaymentSettingsResponse(encryption_configured=configured)
    return PaymentSettingsResponse(
        upi_id=row.upi_id, upi_payee_name=row.upi_payee_name, razorpay_key_id=row.razorpay_key_id,
        razorpay_key_secret_set=bool(row.razorpay_key_secret_encrypted),
        razorpay_webhook_secret_set=bool(row.razorpay_webhook_secret_encrypted),
        encryption_configured=configured,
    )


def _payment_audit(row: Optional[TenantPaymentSettings]) -> dict:
    """Audit values; secrets are recorded only as saved or not"""
    data = _payment_response(row)
    return data.model_dump(include={"upi_id", "upi_payee_name", "razorpay_key_id",
                                    "razorpay_key_secret_set", "razorpay_webhook_secret_set"})


def _encrypted(value: Optional[str], current: Optional[str]) -> Optional[str]:
    """None keeps the saved secret, "" removes it, anything else replaces it"""
    if value is None:
        return current
    if not value:
        return None
    try:
        return encryption.encrypt(value)
    except encryption.EncryptionNotConfigured:
        raise HTTPException(status_code=400, detail="Razorpay secrets cannot be saved: the server's "
                                                    "PAYMENT_ENCRYPTION_KEY is not set")


@router.get("/payment", response_model=PaymentSettingsResponse)
async def get_payment_settings(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Store payment accounts (admin only); secrets are never returned
    """
    return _payment_response(_payment_row(db, context.tenant_id))


@router.put("/payment", response_model=PaymentSettingsResponse)
async def update_payment_settings(
    data: PaymentSettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update store payment accounts (admin only). Razorpay secrets are stored encrypted.
    """
    row = _payment_row(db, context.tenant_id, lock=True)
    old_value = _payment_audit(row)
    if row is None:
        row = TenantPaymentSettings(tenant_id=context.tenant_id)
        db.add(row)
    row.razorpay_key_secret_encrypted = _encrypted(data.razorpay_key_secret,
                                                   row.razorpay_key_secret_encrypted)
    row.razorpay_webhook_secret_encrypted = _encrypted(data.razorpay_webhook_secret,
                                                       row.razorpay_webhook_secret_encrypted)
    row.upi_id = data.upi_id
    row.upi_payee_name = data.upi_payee_name
    row.razorpay_key_id = data.razorpay_key_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "payment_settings", row.id, old_value=old_value, new_value=_payment_audit(row))
    db.commit()
    return _payment_response(row)


@router.get("/upi-qr", response_model=UpiQrResponse)
async def get_upi_qr(
    amount: Decimal = Query(..., gt=0, le=1000000, max_digits=9, decimal_places=2),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    UPI QR code for paying an amount to the store's UPI ID (shown at billing to any staff)
    """
    row = _payment_row(db, context.tenant_id)
    if row is None or not row.upi_id:
        raise HTTPException(status_code=400,
                            detail="Ask an admin to add the store UPI ID in Settings > Payments")
    payee_name = row.upi_payee_name or build_store_settings(db, context.tenant_id).store_name
    return UpiQrResponse(payee_name=payee_name, amount=amount,
                         qr_image=qr_png_base64(upi_uri(row.upi_id, payee_name, amount)))


@router.get("/loyalty", response_model=LoyaltySettings)
async def get_loyalty(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get loyalty points settings
    """
    return get_loyalty_settings(db, context.tenant_id)


@router.put("/loyalty", response_model=LoyaltySettings)
async def update_loyalty(
    loyalty_settings: LoyaltySettings,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update loyalty points settings (admin only)
    """
    old_value = loyalty_settings_values(get_loyalty_settings(db, context.tenant_id))
    new_value = loyalty_settings_values(loyalty_settings)
    upsert_settings(db, context.tenant_id, new_value)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "setting", old_value=old_value, new_value=new_value)
    db.commit()
    return get_loyalty_settings(db, context.tenant_id)


def build_online_settings(db: Session, tenant_id: int) -> OnlineSettings:
    enabled = get_settings_dict(db, tenant_id, [ONLINE_ORDERING_KEY]).get(ONLINE_ORDERING_KEY, "")
    charge, free_min = delivery_settings(db, tenant_id)
    return OnlineSettings(enabled=enabled.lower() == "true", delivery_charge=charge,
                          free_delivery_min=free_min,
                          delivery_pincodes=delivery_pincodes(db, tenant_id))


def _online_values(online: OnlineSettings) -> dict:
    return {
        ONLINE_ORDERING_KEY: str(online.enabled).lower(),
        DELIVERY_CHARGE_KEY: str(online.delivery_charge),
        FREE_DELIVERY_MIN_KEY: str(online.free_delivery_min),
        DELIVERY_PINCODES_KEY: ",".join(online.delivery_pincodes),
    }


@router.get("/online", response_model=OnlineSettings)
async def get_online_settings(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get online ordering settings
    """
    return build_online_settings(db, context.tenant_id)


@router.put("/online", response_model=OnlineSettings)
async def update_online_settings(
    online_settings: OnlineSettings,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update online ordering settings (admin only)
    """
    if online_settings.enabled and not online_settings.delivery_pincodes:
        raise HTTPException(status_code=400,
                            detail="Add at least one delivery pincode before switching online ordering on")
    old_value = _online_values(build_online_settings(db, context.tenant_id))
    new_value = _online_values(online_settings)
    upsert_settings(db, context.tenant_id, new_value)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "setting", old_value=old_value, new_value=new_value)
    db.commit()
    return build_online_settings(db, context.tenant_id)

