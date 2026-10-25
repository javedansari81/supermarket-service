"""
CashierShift and ShiftCashMovement models for cash drawer reconciliation
"""
from sqlalchemy import (Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Index,
                        UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
from app.models.base import TimestampMixin


class CashierShift(Base, TimestampMixin):
    """A session of the store's shared cash drawer, from opening float to closing count"""

    __tablename__ = "cashier_shifts"

    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"
    APPROVAL_PENDING = "pending"
    APPROVAL_APPROVED = "approved"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    shift_no = Column(String(30), nullable=False)
    status = Column(String(20), nullable=False, default=STATUS_OPEN)
    opening_float = Column(Numeric(12, 2), nullable=False, default=0)
    opened_by = Column(Integer, ForeignKey('users.id'))
    opened_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    closed_by = Column(Integer, ForeignKey('users.id'))
    closed_at = Column(DateTime)
    # Note-by-note count at close, e.g. {"500": 3, "10": 4}
    denominations = Column(JSONB)
    counted_cash = Column(Numeric(12, 2))
    expected_cash = Column(Numeric(12, 2))
    difference = Column(Numeric(12, 2))
    close_note = Column(Text)
    # 'pending' when the difference is above the limit, then 'approved'; None when not needed
    approval_status = Column(String(20))
    approved_by = Column(Integer, ForeignKey('users.id'))
    approved_at = Column(DateTime)
    approval_note = Column(Text)

    # Relationships
    movements = relationship("ShiftCashMovement", back_populates="shift", cascade="all, delete-orphan",
                             order_by="ShiftCashMovement.id")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'shift_no', name='uq_cashier_shifts_tenant_no'),
        Index('uq_cashier_shifts_one_open', 'tenant_id', unique=True,
              postgresql_where=text("status = 'open'")),
    )

    def __repr__(self):
        return f"<CashierShift(id={self.id}, no={self.shift_no}, status={self.status})>"


class ShiftCashMovement(Base):
    """Cash added to ('in') or taken out of ('out') the drawer during a shift"""

    __tablename__ = "shift_cash_movements"

    TYPE_IN = "in"
    TYPE_OUT = "out"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey('cashier_shifts.id', ondelete='CASCADE'), nullable=False, index=True)
    movement_type = Column(String(10), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(String(200), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    shift = relationship("CashierShift", back_populates="movements")

    def __repr__(self):
        return f"<ShiftCashMovement(id={self.id}, type={self.movement_type}, amount={self.amount})>"
