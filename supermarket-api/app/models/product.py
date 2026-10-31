"""
Product model for inventory items
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, Date, Boolean, DateTime
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
    # Item name without size / brand; product_name is generated from it unless name_is_custom
    item_name = Column(String(200))
    name_is_custom = Column(Boolean, nullable=False, default=False, server_default='false')
    category_id = Column(Integer, ForeignKey('categories.id'), index=True)
    brand = Column(String(100))
    barcode = Column(String(100), index=True)
    purchase_price = Column(Numeric(10, 2))
    mrp = Column(Numeric(10, 2))
    selling_price = Column(Numeric(10, 2))
    tax_percent = Column(Numeric(5, 2), default=0)
    unit_type = Column(String(50), default='pcs')
    is_loose = Column(Boolean, nullable=False, default=False)
    product_type = Column(String(20), nullable=False, default='own_packed',
                          server_default='own_packed')
    plu_code = Column(Integer)
    hsn_code = Column(String(20))
    # GST item decides HSN and GST %; gst_overridden = either was changed on this product
    gst_item_id = Column(Integer, ForeignKey('gst_items.id'), index=True)
    gst_overridden = Column(Boolean, nullable=False, default=False, server_default='false')
    net_quantity = Column(Numeric(10, 3))
    net_unit = Column(String(5))
    stock_quantity = Column(Numeric(12, 3), default=0)
    reorder_level = Column(Numeric(12, 3), default=0)
    expiry_date = Column(Date)
    # Daily markdown for loose items, valid until markdown_until (UTC)
    markdown_percent = Column(Numeric(5, 2))
    markdown_until = Column(DateTime)
    description = Column(Text)
    # False = sold in store only, hidden from the online shop
    sell_online = Column(Boolean, nullable=False, default=True, server_default='true')
    # Picture in object storage (see app.core.product_images); None = no picture
    image_key = Column(String(300))
    image_updated_at = Column(DateTime)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="products")
    category = relationship("Category", back_populates="products")
    gst_item = relationship("GstItem")
    purchase_items = relationship("PurchaseItem", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")
    stock_movements = relationship("StockMovement", back_populates="product")
    locations = relationship("ProductLocation", back_populates="product",
                             cascade="all, delete-orphan", order_by="ProductLocation.id")
    batches = relationship("ProductBatch", back_populates="product", order_by="ProductBatch.id")

    # manufacturer: maker's barcode, own_packed: packed in-store with our barcode,
    # loose: weighed by the customer, scale label barcode starts with 21
    TYPE_MANUFACTURER = 'manufacturer'
    TYPE_OWN_PACKED = 'own_packed'
    TYPE_LOOSE = 'loose'
    PRODUCT_TYPES = (TYPE_MANUFACTURER, TYPE_OWN_PACKED, TYPE_LOOSE)

    # Unique constraints on tenant_id + product_no and tenant_id + barcode
    __table_args__ = (
        {'extend_existing': True}
    )
    
    @property
    def active_markdown_percent(self):
        """Markdown % while it is valid; None once it has lapsed"""
        if self.markdown_percent and self.markdown_until and self.markdown_until > datetime.utcnow():
            return self.markdown_percent
        return None

    @property
    def image_url(self):
        from app.core.product_images import image_url
        return image_url(self.image_key)

    @property
    def thumb_url(self):
        from app.core.product_images import image_url
        return image_url(self.image_key, thumb=True)

    def __repr__(self):
        return f"<Product(id={self.id}, no={self.product_no}, name={self.product_name})>"

