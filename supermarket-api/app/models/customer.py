"""
Customer model, identified by mobile number
"""
from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class Customer(Base, TimestampMixin, StatusMixin):
    """Customer model keyed by 10-digit mobile number per tenant"""

    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    mobile = Column(String(10), nullable=False)
    customer_name = Column(String(200))
    customer_gstin = Column(String(15))

    # Relationships
    tenant = relationship("Tenant", back_populates="customers")
    sales = relationship("Sale", back_populates="customer")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'mobile', name='uq_customers_tenant_mobile'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<Customer(id={self.id}, mobile={self.mobile}, name={self.customer_name})>"
