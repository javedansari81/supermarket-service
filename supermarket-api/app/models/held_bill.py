"""
HeldBill model for carts parked at the billing counter
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class HeldBill(Base, TimestampMixin):
    """A parked cart; stock is not reserved until it is checked out"""

    __tablename__ = "held_bills"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    label = Column(String(100))
    customer_name = Column(String(200))
    customer_phone = Column(String(20))
    coupon_code = Column(String(30))
    items = Column(JSONB, nullable=False, default=list)
    item_count = Column(Integer, nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_by = Column(Integer, ForeignKey('users.id'), index=True)

    # Relationships
    cashier = relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<HeldBill(id={self.id}, items={self.item_count}, total={self.total_amount})>"
