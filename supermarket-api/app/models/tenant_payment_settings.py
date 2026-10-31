"""
TenantPaymentSettings model: a store's payment accounts (UPI ID, Razorpay keys)
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from app.core.database import Base
from app.models.base import TimestampMixin


class TenantPaymentSettings(Base, TimestampMixin):
    """One row per store, read and changed by that store's admins only. Razorpay secrets are
    stored encrypted (app.core.encryption) and never returned by the API."""

    __tablename__ = "tenant_payment_settings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False,
                       unique=True)
    upi_id = Column(String(100), nullable=False, default='', server_default='')
    upi_payee_name = Column(String(50), nullable=False, default='', server_default='')
    razorpay_key_id = Column(String(50), nullable=False, default='', server_default='')
    razorpay_key_secret_encrypted = Column(Text)
    razorpay_webhook_secret_encrypted = Column(Text)

    def __repr__(self):
        return f"<TenantPaymentSettings(tenant_id={self.tenant_id})>"
