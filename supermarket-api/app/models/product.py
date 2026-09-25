"""
Product model for inventory items
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, Date, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class Product(Base, TimestampMixin, StatusMixin):
    """Product model for inventory items"""
    
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    product_no = Column(String(50), nullable=False)
    product_name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey('categories.id'), index=True)
    brand = Column(String(100))
    barcode = Column(String(100), index=True)
    purchase_price = Column(Numeric(10, 2))
    mrp = Column(Numeric(10, 2))
    selling_price = Column(Numeric(10, 2))
    tax_percent = Column(Numeric(5, 2), default=0)
    unit_type = Column(String(50), default='pcs')
    is_loose = Column(Boolean, nullable=False, default=False)
    hsn_code = Column(String(20))
    stock_quantity = Column(Numeric(12, 3), default=0)
    reorder_level = Column(Numeric(12, 3), default=0)
    expiry_date = Column(Date)
    description = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="products")
    category = relationship("Category", back_populates="products")
    purchase_items = relationship("PurchaseItem", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")
    stock_movements = relationship("StockMovement", back_populates="product")
    locations = relationship("ProductLocation", back_populates="product",
                             cascade="all, delete-orphan", order_by="ProductLocation.id")
    batches = relationship("ProductBatch", back_populates="product", order_by="ProductBatch.id")

    # Unique constraints on tenant_id + product_no and tenant_id + barcode
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<Product(id={self.id}, no={self.product_no}, name={self.product_name})>"

