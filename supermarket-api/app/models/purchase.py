"""
Purchase and PurchaseItem models for procurement
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, Date, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
from app.models.base import TimestampMixin


class Purchase(Base, TimestampMixin):
    """Purchase model for procurement entries"""
    
    __tablename__ = "purchases"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    purchase_no = Column(String(50), nullable=False)
    supplier_id = Column(Integer, ForeignKey('suppliers.id'), index=True)
    supplier_invoice_no = Column(String(100))
    purchase_date = Column(Date, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0)
    remarks = Column(Text)
    status = Column(String(20), default='completed')
    bill_file_key = Column(String(300))
    bill_file_name = Column(String(255))
    bill_content_type = Column(String(100))
    bill_uploaded_at = Column(DateTime)
    created_by = Column(Integer, ForeignKey('users.id'))

    # Relationships
    tenant = relationship("Tenant", back_populates="purchases")
    supplier = relationship("Supplier", back_populates="purchases")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    
    # Unique constraint on tenant_id + purchase_no
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Purchase(id={self.id}, no={self.purchase_no}, tenant_id={self.tenant_id})>"


class PurchaseItem(Base):
    """Purchase item model for individual items in a purchase"""
    
    __tablename__ = "purchase_items"
    
    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey('purchases.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_cost = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product", back_populates="purchase_items")

    @property
    def product_name(self):
        return self.product.product_name if self.product else None

    def __repr__(self):
        return f"<PurchaseItem(id={self.id}, purchase_id={self.purchase_id}, product_id={self.product_id})>"

