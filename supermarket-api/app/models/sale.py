"""
Sale, SaleItem and SalePayment models for billing
"""
from sqlalchemy import (Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Boolean,
                        UniqueConstraint)
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
    # Single mode, or 'split' when paid by more than one mode (see payments)
    payment_mode = Column(String(50), default='cash')
    payment_status = Column(String(20), default='paid')
    # Cash handed over and change returned; None when no cash was paid
    cash_tendered = Column(Numeric(12, 2))
    change_given = Column(Numeric(12, 2))
    customer_name = Column(String(200))
    customer_phone = Column(String(20))
    customer_gstin = Column(String(15))
    customer_id = Column(Integer, ForeignKey('customers.id'), index=True)
    place_of_supply = Column(String(100))
    is_interstate = Column(Boolean, default=False, nullable=False)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    # Coupon used on the bill; code kept as billed, coupon_discount is part of discount_amount
    coupon_id = Column(Integer, ForeignKey('coupons.id', ondelete='SET NULL'), index=True)
    coupon_code = Column(String(30))
    coupon_discount = Column(Numeric(12, 2), default=0, nullable=False)
    # Loyalty points earned and redeemed on the bill (redeemed value is the 'points' payment)
    points_earned = Column(Integer, default=0, nullable=False, server_default='0')
    points_redeemed = Column(Integer, default=0, nullable=False, server_default='0')
    remarks = Column(Text)
    status = Column(String(20), default='completed')
    created_by = Column(Integer, ForeignKey('users.id'))
    voided_at = Column(DateTime)
    voided_by = Column(Integer, ForeignKey('users.id'))
    void_reason = Column(Text)
    # Cash drawer shift the bill was made in, and the shift its void took the cash out of
    shift_id = Column(Integer, ForeignKey('cashier_shifts.id'), index=True)
    void_shift_id = Column(Integer, ForeignKey('cashier_shifts.id'), index=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments = relationship("SalePayment", back_populates="sale", cascade="all, delete-orphan",
                            order_by="SalePayment.id")
    invoice = relationship("Invoice", back_populates="sale", uselist=False)
    customer = relationship("Customer", back_populates="sales")
    returns = relationship("SaleReturn", back_populates="sale", order_by="SaleReturn.id")
    
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
    batch_id = Column(Integer, ForeignKey('product_batches.id'), index=True)
    product_name = Column(String(200), nullable=False)
    barcode = Column(String(100))
    hsn_code = Column(String(20))
    unit_type = Column(String(20))
    mrp = Column(Numeric(10, 2))
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    # Purchase cost per unit when sold (batch cost, else product cost); None on older bills
    unit_cost = Column(Numeric(10, 2))
    taxable_value = Column(Numeric(12, 2), default=0)
    tax_percent = Column(Numeric(5, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)
    cgst_amount = Column(Numeric(10, 2), default=0)
    sgst_amount = Column(Numeric(10, 2), default=0)
    igst_amount = Column(Numeric(10, 2), default=0)
    discount_percent = Column(Numeric(5, 2), default=0)
    discount_amount = Column(Numeric(10, 2), default=0)
    # 'manual' (older bills), 'clearance' (near-expiry / markdown), 'offer' or 'coupon'; None without a discount
    discount_source = Column(String(20))
    offer_id = Column(Integer, ForeignKey('offers.id', ondelete='SET NULL'))
    offer_name = Column(String(100))
    line_total = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    sale = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")
    
    def __repr__(self):
        return f"<SaleItem(id={self.id}, product={self.product_name}, qty={self.quantity})>"


class SalePayment(Base):
    """Amount paid by one mode on a sale; a sale's payments add up to its total"""

    __tablename__ = "sale_payments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    sale_id = Column(Integer, ForeignKey('sales.id', ondelete='CASCADE'), nullable=False, index=True)
    mode = Column(String(20), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    # Optional UPI transaction id or card last digits
    reference = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    sale = relationship("Sale", back_populates="payments")

    __table_args__ = (
        UniqueConstraint('sale_id', 'mode', name='uq_sale_payments_sale_mode'),
    )

    def __repr__(self):
        return f"<SalePayment(id={self.id}, sale={self.sale_id}, mode={self.mode}, amount={self.amount})>"

