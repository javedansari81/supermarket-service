"""
Base model with common fields and utilities
"""
from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, String
from sqlalchemy.ext.declarative import declared_attr
from app.core.database import Base


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps"""
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TenantMixin:
    """Mixin for tenant-scoped models"""
    
    @declared_attr
    def tenant_id(cls):
        from sqlalchemy import ForeignKey
        return Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)


class StatusMixin:
    """Mixin for status field"""
    
    status = Column(String(20), default='active', nullable=False)


class AuditMixin:
    """Mixin for audit fields (created_by, updated_by)"""
    
    @declared_attr
    def created_by(cls):
        from sqlalchemy import ForeignKey
        return Column(Integer, ForeignKey('users.id'), nullable=True)
    
    @declared_attr
    def updated_by(cls):
        from sqlalchemy import ForeignKey
        return Column(Integer, ForeignKey('users.id'), nullable=True)

