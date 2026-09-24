"""
Audit log schemas
"""
from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    """Schema for audit log response"""
    id: int
    tenant_id: int
    user_id: Optional[int] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None
    reference: Optional[str] = None
    summary: Optional[str] = None
    
    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    """Schema for audit log list response"""
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int

