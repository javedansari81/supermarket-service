"""
ClearanceRule model: near-expiry discount tiers for packed batches
"""
from sqlalchemy import Column, Integer, ForeignKey, CheckConstraint, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class ClearanceRule(Base, TimestampMixin):
    """Discount tiers by days left to expiry. Scope: store default (no category, no product),
    a category or a product; the most specific rule wins. An empty tier list means no discount."""

    __tablename__ = "clearance_rules"

    DEFAULT_TIERS = [
        {"days_left": 30, "percent": 10},
        {"days_left": 15, "percent": 20},
        {"days_left": 7, "percent": 30},
    ]

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey('categories.id', ondelete='CASCADE'))
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'))
    # [{"days_left": 30, "percent": 10}, ...]
    tiers = Column(JSONB, nullable=False, default=list)
    updated_by = Column(Integer, ForeignKey('users.id'))

    # Relationships
    category = relationship("Category")
    product = relationship("Product")

    __table_args__ = (
        CheckConstraint('category_id IS NULL OR product_id IS NULL', name='ck_clearance_rules_scope'),
        Index('uq_clearance_rules_default', 'tenant_id', unique=True,
              postgresql_where=text('category_id IS NULL AND product_id IS NULL')),
        Index('uq_clearance_rules_category', 'tenant_id', 'category_id', unique=True,
              postgresql_where=text('category_id IS NOT NULL')),
        Index('uq_clearance_rules_product', 'tenant_id', 'product_id', unique=True,
              postgresql_where=text('product_id IS NOT NULL')),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<ClearanceRule(id={self.id}, category={self.category_id}, product={self.product_id})>"
