"""
Offer models: festival / promotional discounts on products for a date range
"""
from datetime import datetime
from sqlalchemy import (Column, Integer, String, Date, Boolean, Numeric, DateTime, ForeignKey,
                        CheckConstraint, UniqueConstraint)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class Offer(Base, TimestampMixin):
    """Runs from start_date to end_date (inclusive, IST calendar days) while active"""

    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))

    # Relationships
    items = relationship("OfferItem", back_populates="offer", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint('end_date >= start_date', name='ck_offers_dates'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<Offer(id={self.id}, name={self.name})>"


class OfferItem(Base):
    """A product in an offer: 'percent' off, or 'amount' (Rs) off per unit (per kg if loose)"""

    __tablename__ = "offer_items"

    TYPE_PERCENT = "percent"
    TYPE_AMOUNT = "amount"

    id = Column(Integer, primary_key=True, index=True)
    offer_id = Column(Integer, ForeignKey('offers.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'), nullable=False, index=True)
    discount_type = Column(String(10), nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    offer = relationship("Offer", back_populates="items")
    product = relationship("Product")

    __table_args__ = (
        UniqueConstraint('offer_id', 'product_id', name='uq_offer_items_product'),
        CheckConstraint("discount_type IN ('percent', 'amount')", name='ck_offer_items_type'),
        CheckConstraint('discount_value > 0', name='ck_offer_items_value'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<OfferItem(offer={self.offer_id}, product={self.product_id})>"
