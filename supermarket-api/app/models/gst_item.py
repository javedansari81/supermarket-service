"""
GST lookup items shared by all tenants, and their placement under tenant categories
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class GstItem(Base, TimestampMixin, StatusMixin):
    """Item with its HSN code and GST %; loose = sold loose, packed = pre-packaged and labelled"""

    __tablename__ = "gst_items"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String(100), nullable=False, unique=True)
    hsn_code = Column(String(8), nullable=False)
    gst_percent_loose = Column(Numeric(5, 2), nullable=False)
    gst_percent_packed = Column(Numeric(5, 2), nullable=False)

    def gst_percent_for(self, product_type: str):
        return self.gst_percent_loose if product_type == "loose" else self.gst_percent_packed

    def __repr__(self):
        return f"<GstItem(id={self.id}, name={self.item_name}, hsn={self.hsn_code})>"


class CategoryGstItem(Base):
    """A GST item sits under one category per tenant"""

    __tablename__ = "category_gst_items"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    category_id = Column(Integer, ForeignKey('categories.id', ondelete='CASCADE'), nullable=False, index=True)
    gst_item_id = Column(Integer, ForeignKey('gst_items.id', ondelete='CASCADE'), nullable=False)

    category = relationship("Category", back_populates="gst_links")
    gst_item = relationship("GstItem")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'gst_item_id', name='category_gst_items_tenant_id_gst_item_id_key'),
    )
