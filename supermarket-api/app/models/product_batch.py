"""
Product batch model: stock of a packed product received at one MRP / price / expiry
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class ProductBatch(Base, TimestampMixin):
    """Stock batch of a packed product; loose items have no batches"""

    __tablename__ = "product_batches"

    OPENING = "OPENING"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'), nullable=False, index=True)
    batch_no = Column(String(50))
    barcode = Column(String(100))
    mrp = Column(Numeric(10, 2))
    selling_price = Column(Numeric(10, 2))
    purchase_price = Column(Numeric(10, 2))
    expiry_date = Column(Date)
    quantity_received = Column(Numeric(12, 3), nullable=False, default=0)
    quantity_left = Column(Numeric(12, 3), nullable=False, default=0)
    purchase_id = Column(Integer, ForeignKey('purchases.id'))

    # Relationships
    product = relationship("Product", back_populates="batches")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'barcode', name='uq_product_batches_tenant_barcode'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<ProductBatch(id={self.id}, product_id={self.product_id}, mrp={self.mrp}, left={self.quantity_left})>"
