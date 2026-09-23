"""
Sale and SaleItem models for billing
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
from app.models.base import TimestampMixin


class Sale(Base, TimestampMixin):
    """Sale model for billing transactions"""
    
    __tablename__ = "sales"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    sale_no = Column(String(50), nullable=False)
    sale_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    subtotal = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    payment_mode = Column(String(50), default='cash')
    payment_status = Column(String(20), default='paid')
    customer_name = Column(String(200))
    customer_phone = Column(String(20))
    customer_gstin = Column(String(15))
    place_of_supply = Column(String(100))
    is_interstate = Column(Boolean, default=False, nullable=False)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    remarks = Column(Text)
    status = Column(String(20), default='completed')
    created_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    invoice = relationship("Invoice", back_populates="sale", uselist=False)
    
    # Unique constraint on tenant_id + sale_no
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Sale(id={self.id}, no={self.sale_no}, total={self.total_amount})>"


class SaleItem(Base):
    """Sale item model for individual items in a sale"""
    
    __tablename__ = "sale_items"
    
    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey('sales.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    barcode = Column(String(100))
    hsn_code = Column(String(20))
    unit_type = Column(String(20))
    mrp = Column(Numeric(10, 2))
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    taxable_value = Column(Numeric(12, 2), default=0)
    tax_percent = Column(Numeric(5, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)
    cgst_amount = Column(Numeric(10, 2), default=0)
    sgst_amount = Column(Numeric(10, 2), default=0)
    igst_amount = Column(Numeric(10, 2), default=0)
    discount_percent = Column(Numeric(5, 2), default=0)
    discount_amount = Column(Numeric(10, 2), default=0)
    line_total = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    sale = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")
    
    def __repr__(self):
        return f"<SaleItem(id={self.id}, product={self.product_name}, qty={self.quantity})>"

