"""
LoyaltyTransaction model: ledger of every change to a customer's loyalty points
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, CheckConstraint
from app.core.database import Base


class LoyaltyTransaction(Base):
    """Signed points change (+ credit, - debit) with the customer's balance after it"""

    __tablename__ = "loyalty_transactions"

    TYPE_EARN = "earn"
    TYPE_REDEEM = "redeem"
    TYPE_EARN_REVERSAL = "earn_reversal"
    TYPE_REDEEM_REFUND = "redeem_refund"
    TYPE_ADJUST = "adjust"
    TYPE_EXPIRE = "expire"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'),
                       nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete='CASCADE'),
                         nullable=False, index=True)
    txn_type = Column(String(20), nullable=False)
    points = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    sale_id = Column(Integer, ForeignKey('sales.id', ondelete='SET NULL'), index=True)
    return_id = Column(Integer, ForeignKey('sale_returns.id', ondelete='SET NULL'))
    remarks = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "txn_type IN ('earn', 'redeem', 'earn_reversal', 'redeem_refund', 'adjust', 'expire')",
            name='loyalty_transactions_txn_type_check'),
        CheckConstraint('points <> 0', name='loyalty_transactions_points_check'),
        CheckConstraint('balance_after >= 0', name='loyalty_transactions_balance_after_check'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return (f"<LoyaltyTransaction(id={self.id}, customer={self.customer_id}, "
                f"type={self.txn_type}, points={self.points})>")
