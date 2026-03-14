"""
Invoice model for invoice management
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Invoice(Base):
    """Invoice model for generated invoices"""
    
    __tablename__ = "invoices"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    sale_id = Column(Integer, ForeignKey('sales.id'), nullable=False, index=True)
    invoice_no = Column(String(50), nullable=False)
    invoice_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    store_name = Column(String(200))
    store_address = Column(Text)
    store_contact = Column(String(50))
    store_gst = Column(String(50))
    customer_name = Column(String(200))
    customer_phone = Column(String(20))
    subtotal = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    payment_mode = Column(String(50))
    footer_message = Column(Text)
    printed_count = Column(Integer, default=0)
    last_printed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="invoices")
    sale = relationship("Sale", back_populates="invoice")
    
    # Unique constraint on tenant_id + invoice_no
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Invoice(id={self.id}, no={self.invoice_no}, total={self.total_amount})>"

