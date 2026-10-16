"""
Coupon model: codes entered at checkout for a discount on the bill
"""
from sqlalchemy import Column, Integer, String, Date, Boolean, Numeric, ForeignKey, CheckConstraint
from app.core.database import Base
from app.models.base import TimestampMixin


class Coupon(Base, TimestampMixin):
    """'percent' off each line (optionally capped by max_discount) or 'amount' (Rs) off the bill.
    Valid from start_date to end_date (inclusive, IST calendar days) while active."""

    __tablename__ = "coupons"

    TYPE_PERCENT = "percent"
    TYPE_AMOUNT = "amount"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    code = Column(String(30), nullable=False)
    description = Column(String(200))
    discount_type = Column(String(10), nullable=False)
    discount_value = Column(Numeric(10, 2), nullable=False)
    max_discount = Column(Numeric(10, 2))
    min_bill_amount = Column(Numeric(12, 2), nullable=False, default=0)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    usage_limit = Column(Integer)
    per_customer_limit = Column(Integer)
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_by = Column(Integer, ForeignKey('users.id'))

    __table_args__ = (
        CheckConstraint('end_date >= start_date', name='ck_coupons_dates'),
        CheckConstraint("discount_type IN ('percent', 'amount')", name='ck_coupons_type'),
        CheckConstraint('discount_value > 0', name='ck_coupons_value'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<Coupon(id={self.id}, code={self.code})>"
