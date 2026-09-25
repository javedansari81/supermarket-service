"""
Store location models: physical places in the store and the products assigned to them
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class StoreLocation(Base, TimestampMixin, StatusMixin):
    """A rack shelf in the store (e.g. D01-2); the type is the rack purpose: display, storage or promo"""

    __tablename__ = "store_locations"

    TYPES = ("display", "storage", "promo")
    RACK_PREFIX = {"display": "D", "storage": "S", "promo": "P"}

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    location_code = Column(String(50), nullable=False)
    location_type = Column(String(20), nullable=False, default='display')
    floor = Column(String(20), nullable=False, default='Ground')
    rack_no = Column(String(10), nullable=False)
    shelf_no = Column(String(5))
    description = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))

    # Relationships
    tenant = relationship("Tenant", back_populates="store_locations")
    product_links = relationship("ProductLocation", back_populates="location")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'location_code', name='uq_store_locations_tenant_code'),
        {'extend_existing': True}
    )

    @staticmethod
    def build_code(rack_no: str, shelf_no: str = None) -> str:
        return f"{rack_no}-{shelf_no}" if shelf_no else rack_no

    def __repr__(self):
        return f"<StoreLocation(id={self.id}, code={self.location_code}, tenant_id={self.tenant_id})>"


class ProductLocation(Base, TimestampMixin):
    """Assignment of a product to a store location; the role follows the location type"""

    __tablename__ = "product_locations"

    ROLES = ("display", "storage", "promo")

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey('store_locations.id'), nullable=False, index=True)
    role = Column(String(20), nullable=False, default='display')
    is_primary = Column(Boolean, nullable=False, default=False)

    # Relationships
    product = relationship("Product", back_populates="locations")
    location = relationship("StoreLocation", back_populates="product_links")

    __table_args__ = (
        UniqueConstraint('product_id', 'location_id', name='uq_product_locations_product_location'),
        {'extend_existing': True}
    )

    @property
    def location_code(self):
        return self.location.location_code if self.location else None

    @property
    def floor(self):
        return self.location.floor if self.location else None

    def __repr__(self):
        return f"<ProductLocation(product_id={self.product_id}, location_id={self.location_id}, role={self.role})>"
