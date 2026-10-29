"""
CustomerAccount, CustomerOtp and CustomerRefreshToken models for customer login by mobile OTP,
and CustomerPushSubscription for order updates by browser notification
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Index
from datetime import datetime
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class CustomerAccount(Base, TimestampMixin, StatusMixin):
    """One online login for all stores (a verified mobile number). Store data stays in each
    store's Customer row with the same mobile number."""

    __tablename__ = "customer_accounts"

    id = Column(Integer, primary_key=True, index=True)
    mobile = Column(String(10), nullable=False, unique=True)
    customer_name = Column(String(200))
    last_login = Column(DateTime)

    def __repr__(self):
        return f"<CustomerAccount(id={self.id}, mobile={self.mobile})>"


class CustomerOtp(Base):
    """One-time login code sent to a mobile number (only its hash is stored)"""

    __tablename__ = "customer_otps"

    id = Column(Integer, primary_key=True, index=True)
    mobile = Column(String(10), nullable=False)
    code_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0, server_default='0')
    consumed_at = Column(DateTime)
    ip_address = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('idx_customer_otps_mobile_created', 'mobile', 'created_at'),
        Index('idx_customer_otps_ip_created', 'ip_address', 'created_at'),
    )

    def __repr__(self):
        return f"<CustomerOtp(id={self.id}, mobile={self.mobile})>"


class CustomerRefreshToken(Base):
    """Long-lived customer session; rotated on every refresh (only its hash is stored)"""

    __tablename__ = "customer_refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey('customer_accounts.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime)
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<CustomerRefreshToken(id={self.id}, account_id={self.account_id})>"


class CustomerPushSubscription(Base):
    """A browser where the customer turned on order updates (Web Push address and keys)"""

    __tablename__ = "customer_push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey('customer_accounts.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String(200), nullable=False)
    auth = Column(String(100), nullable=False)
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_sent_at = Column(DateTime)

    def __repr__(self):
        return f"<CustomerPushSubscription(id={self.id}, account_id={self.account_id})>"
