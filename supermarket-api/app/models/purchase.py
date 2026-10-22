"""
Purchase and PurchaseItem models for procurement
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, Date, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
from app.models.base import TimestampMixin


class Purchase(Base, TimestampMixin):
    """Purchase model for procurement entries"""
    
    __tablename__ = "purchases"

    BILL_GST_INVOICE = "gst_invoice"
    BILL_NO_GST = "no_gst"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    purchase_no = Column(String(50), nullable=False)
    supplier_id = Column(Integer, ForeignKey('suppliers.id'), index=True)
    supplier_invoice_no = Column(String(100))
    purchase_date = Column(Date, nullable=False)
    # 'gst_invoice' (supplier charged GST) or 'no_gst' (handwritten receipt, bill of supply)
    bill_type = Column(String(20), nullable=False, default=BILL_NO_GST, server_default=BILL_NO_GST)
    # Supplier GSTIN and inter-state flag as on the bill
    supplier_gstin = Column(String(15))
    is_interstate = Column(Boolean, nullable=False, default=False, server_default='false')
    # Amount without claimed GST, and the GST claimed as input tax credit
    taxable_amount = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    # Bill grand total minus the sum of line amounts
    round_off = Column(Numeric(10, 2), default=0)
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
    # Price per unit as on the bill (GST included)
    rate = Column(Numeric(10, 2), nullable=False)
    # Cost per unit to stock, without the GST that is claimed
    unit_cost = Column(Numeric(10, 2), nullable=False)
    # Line amount as on the bill
    total_cost = Column(Numeric(12, 2), nullable=False)
    hsn_code = Column(String(20))
    # None when the bill does not show it
    gst_percent = Column(Numeric(5, 2))
    taxable_value = Column(Numeric(12, 2), default=0)
    tax_amount = Column(Numeric(12, 2), default=0)
    cgst_amount = Column(Numeric(12, 2), default=0)
    sgst_amount = Column(Numeric(12, 2), default=0)
    igst_amount = Column(Numeric(12, 2), default=0)
    # On a GST bill with its GST % shown, so its GST is claimed
    itc_eligible = Column(Boolean, nullable=False, default=False, server_default='false')
    batch_id = Column(Integer, ForeignKey('product_batches.id'), index=True)
    batch_no = Column(String(50))
    mrp = Column(Numeric(10, 2))
    selling_price = Column(Numeric(10, 2))
    expiry_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product", back_populates="purchase_items")
    batch = relationship("ProductBatch")

    @property
    def product_name(self):
        return self.product.product_name if self.product else None

    def __repr__(self):
        return f"<PurchaseItem(id={self.id}, purchase_id={self.purchase_id}, product_id={self.product_id})>"

