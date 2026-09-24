"""
Audit log endpoints
"""
from typing import Optional, Tuple
from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse, AuditLogListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()

NAME_FIELDS = {
    "product": "product_name",
    "category": "category_name",
    "supplier": "supplier_name",
    "user": "username",
}
IGNORED_DIFF_FIELDS = {
    "id", "tenant_id", "created_at", "updated_at", "created_by", "updated_by", "items", "last_login",
}
MAX_DIFF_FIELDS = 3


def format_money(value) -> str:
    try:
        return f"₹{float(value):,.2f}"
    except (TypeError, ValueError):
        return "₹0.00"


def format_field(name: str) -> str:
    return name.replace("_", " ").capitalize()


def format_value(value) -> str:
    if value is None or value == "":
        return "(empty)"
    return str(value)


def describe_changes(old_value: Optional[dict], new_value: Optional[dict]) -> str:
    """Human readable list of changed fields, e.g. 'Mrp: 50.00 → 55.00'"""
    old_value, new_value = old_value or {}, new_value or {}
    changes = [
        f"{format_field(key)}: {format_value(old_value.get(key))} → {format_value(new_value.get(key))}"
        for key in new_value
        if key not in IGNORED_DIFF_FIELDS and old_value.get(key) != new_value.get(key)
    ]
    if not changes:
        return "No field changes"
    extra = len(changes) - MAX_DIFF_FIELDS
    summary = "; ".join(changes[:MAX_DIFF_FIELDS])
    return f"{summary} (+{extra} more)" if extra > 0 else summary


def describe_audit(log: AuditLog, user_names: dict) -> Tuple[Optional[str], Optional[str]]:
    """Return (reference, summary) for an audit entry based on its stored values"""
    new_value = log.new_value or {}
    old_value = log.old_value or {}
    values = new_value or old_value
    entity_type, action = log.entity_type, log.action

    if action == AuditLog.ACTION_LOGIN:
        return user_names.get(log.entity_id), "Logged in"
    if action == AuditLog.ACTION_LOGOUT:
        return user_names.get(log.entity_id), "Logged out"

    if entity_type == "sale":
        parts = [format_money(values.get("total_amount")), f"{len(values.get('items') or [])} item(s)"]
        if values.get("payment_mode"):
            parts.append(str(values["payment_mode"]).upper())
        if values.get("customer_name"):
            parts.append(f"Customer: {values['customer_name']}")
        if values.get("invoice_no"):
            parts.append(f"Invoice {values['invoice_no']}")
        return values.get("sale_no"), " · ".join(parts)

    if entity_type == "invoice":
        if action == AuditLog.ACTION_PRINT:
            count = values.get("printed_count") or 1
            label = "Printed" if count <= 1 else f"Reprinted (print #{count})"
            if values.get("total_amount") is not None:
                label = f"{label} · {format_money(values['total_amount'])}"
            return values.get("invoice_no"), label
        parts = [format_money(values.get("total_amount"))]
        if values.get("payment_mode"):
            parts.append(str(values["payment_mode"]).upper())
        if values.get("customer_name"):
            parts.append(f"Customer: {values['customer_name']}")
        if values.get("sale_no"):
            parts.append(f"Sale {values['sale_no']}")
        return values.get("invoice_no"), " · ".join(parts)

    if entity_type == "purchase":
        reference = values.get("purchase_no")
        if action == AuditLog.ACTION_CREATE:
            parts = [format_money(values.get("total_amount")), f"{len(values.get('items') or [])} item(s)"]
            if values.get("supplier_invoice_no"):
                parts.append(f"Supplier invoice {values['supplier_invoice_no']}")
            return reference, " · ".join(parts)
        if action == AuditLog.ACTION_DELETE:
            return reference, f"Cancelled ({format_money(values.get('total_amount'))})"
        summary = describe_changes(old_value, new_value)
        if old_value.get("items") != new_value.get("items"):
            summary = "Items changed" if summary == "No field changes" else f"{summary}; items changed"
        return reference, summary

    if entity_type == "setting":
        reference = "Store settings" if "store_name" in values else "Billing settings"
        return reference, describe_changes(old_value, new_value)

    name_field = NAME_FIELDS.get(entity_type)
    reference = values.get(name_field) if name_field else None
    if entity_type == "user" and not reference:
        reference = user_names.get(log.entity_id)

    if new_value.get("password_reset"):
        return reference, "Password reset"
    if action == AuditLog.ACTION_CREATE:
        return reference, "Created"
    if action == AuditLog.ACTION_DELETE:
        return reference, "Deactivated"
    return reference, describe_changes(old_value, new_value)


def build_audit_response(log: AuditLog, user_names: dict) -> AuditLogResponse:
    reference, summary = describe_audit(log, user_names)
    response = AuditLogResponse.model_validate(log)
    response.user_name = user_names.get(log.user_id)
    response.reference = reference
    response.summary = summary
    return response


def load_user_names(db: Session, tenant_id: int, logs: list) -> dict:
    """Map user id -> display name for actors and user entities in the given logs"""
    user_ids = {log.user_id for log in logs if log.user_id}
    user_ids |= {log.entity_id for log in logs if log.entity_type == "user" and log.entity_id}
    if not user_ids:
        return {}
    users = db.query(User.id, User.username, User.full_name).filter(
        User.tenant_id == tenant_id, User.id.in_(user_ids)
    ).all()
    return {u.id: u.full_name or u.username for u in users}


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    user_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    List audit logs for current tenant (admin only)
    """
    query = db.query(AuditLog).filter(AuditLog.tenant_id == context.tenant_id)
    
    if action:
        query = query.filter(AuditLog.action == action)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    
    if from_date:
        query = query.filter(func.date(AuditLog.created_at) >= from_date)
    
    if to_date:
        query = query.filter(func.date(AuditLog.created_at) <= to_date)
    
    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    user_names = load_user_names(db, context.tenant_id, items)

    return AuditLogListResponse(
        items=[build_audit_response(item, user_names) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/actions")
async def get_audit_actions():
    """
    Get list of possible audit actions
    """
    return {
        "actions": [
            {"value": "create", "label": "Create"},
            {"value": "update", "label": "Update"},
            {"value": "delete", "label": "Delete"},
            {"value": "login", "label": "Login"},
            {"value": "logout", "label": "Logout"},
            {"value": "print", "label": "Print"}
        ]
    }


@router.get("/entity-types")
async def get_entity_types():
    """
    Get list of possible entity types
    """
    return {
        "entity_types": [
            {"value": "product", "label": "Product"},
            {"value": "category", "label": "Category"},
            {"value": "supplier", "label": "Supplier"},
            {"value": "purchase", "label": "Purchase"},
            {"value": "sale", "label": "Sale"},
            {"value": "invoice", "label": "Invoice"},
            {"value": "user", "label": "User"},
            {"value": "setting", "label": "Setting"}
        ]
    }


@router.get("/{audit_id}", response_model=AuditLogResponse)
async def get_audit_log(
    audit_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get audit log by ID (admin only)
    """
    from fastapi import HTTPException
    
    audit_log = db.query(AuditLog).filter(
        AuditLog.id == audit_id,
        AuditLog.tenant_id == context.tenant_id
    ).first()
    
    if not audit_log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    return build_audit_response(audit_log, load_user_names(db, context.tenant_id, [audit_log]))

