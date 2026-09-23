"""
Tenant model for multi-tenant support
"""
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class Tenant(Base, TimestampMixin, StatusMixin):
    """Tenant model representing a supermarket/business entity"""
    
    __tablename__ = "tenants"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_code = Column(String(50), unique=True, nullable=False, index=True)
    tenant_name = Column(String(200), nullable=False)
    address = Column(Text)
    contact_no = Column(String(20))
    email = Column(String(100))
    gst_no = Column(String(50))
    
    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    settings = relationship("TenantSetting", back_populates="tenant", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="tenant", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="tenant", cascade="all, delete-orphan")
    suppliers = relationship("Supplier", back_populates="tenant", cascade="all, delete-orphan")
    purchases = relationship("Purchase", back_populates="tenant", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="tenant", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="tenant", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="tenant", cascade="all, delete-orphan")
    stock_movements = relationship("StockMovement", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant", cascade="all, delete-orphan")
    barcode_configs = relationship("BarcodeConfig", back_populates="tenant", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Tenant(id={self.id}, code={self.tenant_code}, name={self.tenant_name})>"

