"""
SaleReturn and SaleReturnItem models for customer returns (credit notes)
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class SaleReturn(Base):
    """Customer return against a sale (credit note)"""

    __tablename__ = "sale_returns"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    sale_id = Column(Integer, ForeignKey('sales.id'), nullable=False, index=True)
    return_no = Column(String(50), nullable=False)
    return_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    subtotal = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    refund_mode = Column(String(50), default='cash')
    reason = Column(Text)
    window_override = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    sale = relationship("Sale", back_populates="returns")
    items = relationship("SaleReturnItem", back_populates="sale_return", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SaleReturn(id={self.id}, no={self.return_no}, total={self.total_amount})>"


class SaleReturnItem(Base):
    """Returned quantity of one sale line"""

    __tablename__ = "sale_return_items"

    id = Column(Integer, primary_key=True, index=True)
    return_id = Column(Integer, ForeignKey('sale_returns.id', ondelete='CASCADE'), nullable=False, index=True)
    sale_item_id = Column(Integer, ForeignKey('sale_items.id'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    unit_type = Column(String(20))
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    taxable_value = Column(Numeric(12, 2), default=0)
    tax_percent = Column(Numeric(5, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)
    cgst_amount = Column(Numeric(10, 2), default=0)
    sgst_amount = Column(Numeric(10, 2), default=0)
    igst_amount = Column(Numeric(10, 2), default=0)
    discount_amount = Column(Numeric(10, 2), default=0)
    line_total = Column(Numeric(12, 2), nullable=False)
    restock = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    sale_return = relationship("SaleReturn", back_populates="items")

    def __repr__(self):
        return f"<SaleReturnItem(id={self.id}, product={self.product_name}, qty={self.quantity})>"
