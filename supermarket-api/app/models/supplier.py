"""
Supplier model for vendor management
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class Supplier(Base, TimestampMixin, StatusMixin):
    """Supplier model for vendor/supplier management"""
    
    __tablename__ = "suppliers"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    supplier_code = Column(String(50), nullable=False)
    supplier_name = Column(String(200), nullable=False)
    contact_person = Column(String(100))
    contact_no = Column(String(20))
    email = Column(String(100))
    address = Column(Text)
    gst_no = Column(String(50))
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="suppliers")
    purchases = relationship("Purchase", back_populates="supplier")
    
    # Unique constraint on tenant_id + supplier_code
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Supplier(id={self.id}, code={self.supplier_code}, name={self.supplier_name})>"

