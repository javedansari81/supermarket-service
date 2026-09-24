"""
Audit log helpers
"""
from typing import Optional, Iterable
from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

SENSITIVE_FIELDS = {"password_hash"}


def snapshot(obj, exclude: Iterable[str] = ()) -> Optional[dict]:
    """Serialize a model's column values into a JSON-safe dict"""
    if obj is None:
        return None
    skip = SENSITIVE_FIELDS | set(exclude)
    data = {
        attr.key: getattr(obj, attr.key)
        for attr in inspect(obj).mapper.column_attrs
        if attr.key not in skip
    }
    return jsonable_encoder(data)


def record_audit(
    db: Session,
    request: Optional[Request],
    tenant_id: int,
    user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
) -> None:
    """Add an audit entry to the session; it is committed with the caller's transaction"""
    ip_address = None
    user_agent = None
    if request is not None:
        forwarded = request.headers.get("x-forwarded-for")
        ip_address = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else None
        )
        user_agent = request.headers.get("user-agent")

    db.add(AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=jsonable_encoder(old_value) if old_value is not None else None,
        new_value=jsonable_encoder(new_value) if new_value is not None else None,
        ip_address=ip_address[:50] if ip_address else None,
        user_agent=user_agent,
    ))
