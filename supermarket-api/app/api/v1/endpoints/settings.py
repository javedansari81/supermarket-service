"""
Settings management endpoints
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tenant_setting import TenantSetting
from app.models.tenant import Tenant
from app.schemas.settings import (
    SettingCreate, SettingUpdate, SettingResponse, 
    SettingsListResponse, StoreSettings, BillingSettings, state_code_for
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

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
BILLING_KEYS = ["currency_symbol", "tax_inclusive_pricing", "default_tax_percent", "invoice_prefix", "invoice_footer"]


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
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update store settings (admin only)
    """
    upsert_settings(db, context.tenant_id, {
        "store_name": store_settings.store_name,
        "store_address": store_settings.store_address,
        "store_phone": store_settings.store_phone,
        "store_email": store_settings.store_email,
        "gstin": store_settings.gstin,
        "store_state": store_settings.store_state,
        "fssai_license": store_settings.fssai_license
    })
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
        invoice_footer=settings_dict.get("invoice_footer", "Thank you for shopping!")
    )


@router.put("/billing", response_model=BillingSettings)
async def update_billing_settings(
    billing_settings: BillingSettings,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update billing settings (admin only)
    """
    upsert_settings(db, context.tenant_id, {
        "currency_symbol": billing_settings.currency_symbol,
        "tax_inclusive_pricing": str(billing_settings.tax_inclusive_pricing).lower(),
        "default_tax_percent": str(billing_settings.default_tax_percent),
        "invoice_prefix": billing_settings.invoice_prefix,
        "invoice_footer": billing_settings.invoice_footer
    })
    db.commit()
    return billing_settings

