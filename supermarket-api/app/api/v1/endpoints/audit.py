"""
Audit log endpoints
"""
from typing import Optional
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
    
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],
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
    
    return AuditLogResponse.model_validate(audit_log)

