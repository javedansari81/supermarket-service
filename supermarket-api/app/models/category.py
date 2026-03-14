"""
Category model for product categorization
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin, TenantMixin, AuditMixin


class Category(Base, TimestampMixin, StatusMixin):
    """Category model for product categories"""
    
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    category_name = Column(String(100), nullable=False)
    description = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="categories")
    products = relationship("Product", back_populates="category")
    
    # Unique constraint on tenant_id + category_name
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Category(id={self.id}, name={self.category_name}, tenant_id={self.tenant_id})>"

