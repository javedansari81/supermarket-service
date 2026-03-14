"""
Tenant settings model for tenant-specific configurations
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class TenantSetting(Base, TimestampMixin):
    """Tenant settings model for configurable tenant-specific values"""
    
    __tablename__ = "tenant_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    setting_key = Column(String(100), nullable=False)
    setting_value = Column(Text)
    setting_type = Column(String(50), default='string')
    description = Column(Text)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="settings")
    
    # Unique constraint on tenant_id + setting_key
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<TenantSetting(id={self.id}, key={self.setting_key}, tenant_id={self.tenant_id})>"

