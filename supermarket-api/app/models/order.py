"""
CustomerAddress, Order and OrderItem models for online orders (home delivery)
"""
from sqlalchemy import (Column, Integer, String, Text, Boolean, Numeric, ForeignKey, CheckConstraint,
                        UniqueConstraint, Index, DateTime)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class CustomerAddress(Base, TimestampMixin):
    """Delivery address of an online login, usable at every store"""

    __tablename__ = "customer_addresses"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey('customer_accounts.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    contact_name = Column(String(200), nullable=False)
    contact_mobile = Column(String(10), nullable=False)
    address_line = Column(String(300), nullable=False)
    area = Column(String(200), nullable=False)
    landmark = Column(String(200))
    city = Column(String(100), nullable=False)
    pincode = Column(String(6), nullable=False)
    label = Column(String(20))
    is_default = Column(Boolean, nullable=False, default=False, server_default='false')

    def full_address(self) -> str:
        parts = [self.address_line, self.area, self.landmark and f"Near {self.landmark}", self.city]
        return ", ".join(p for p in parts if p) + f" - {self.pincode}"


class Order(Base, TimestampMixin):
    """Online order; reserves stock while open and becomes a sale when delivered"""

    __tablename__ = "orders"

    STATUS_PLACED = 'placed'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_PACKED = 'packed'
    STATUS_OUT_FOR_DELIVERY = 'out_for_delivery'
    STATUS_DELIVERED = 'delivered'
    STATUS_CANCELLED = 'cancelled'
    # Orders holding stock
    OPEN_STATUSES = (STATUS_PLACED, STATUS_CONFIRMED, STATUS_PACKED, STATUS_OUT_FOR_DELIVERY)
    # The customer can cancel until the order is packed
    CUSTOMER_CANCELLABLE = (STATUS_PLACED, STATUS_CONFIRMED)
    # Staff hand over and take payment once packed
    DELIVERABLE = (STATUS_PACKED, STATUS_OUT_FOR_DELIVERY)

    PAYMENT_COD = 'cod'
    PAYMENT_ONLINE = 'online'

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    order_no = Column(String(30), nullable=False)
    account_id = Column(Integer, ForeignKey('customer_accounts.id'), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id'), nullable=False)
    status = Column(String(20), nullable=False, default=STATUS_PLACED, server_default=STATUS_PLACED)
    payment_method = Column(String(20), nullable=False)
    payment_status = Column(String(20), nullable=False, default='pending', server_default='pending')
    delivery_name = Column(String(200), nullable=False)
    delivery_mobile = Column(String(10), nullable=False)
    delivery_address = Column(Text, nullable=False)
    delivery_pincode = Column(String(6), nullable=False)
    mrp_total = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    items_total = Column(Numeric(12, 2), nullable=False, default=0)
    delivery_charge = Column(Numeric(10, 2), nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    notes = Column(String(500))
    cancel_reason = Column(String(300))
    cancelled_by = Column(String(20))
    sale_id = Column(Integer, ForeignKey('sales.id'))
    confirmed_at = Column(DateTime)
    packed_at = Column(DateTime)
    dispatched_at = Column(DateTime)
    delivered_at = Column(DateTime)
    cancelled_at = Column(DateTime)
    updated_by = Column(Integer, ForeignKey('users.id'))

    tenant = relationship("Tenant")
    customer = relationship("Customer")
    sale = relationship("Sale")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan",
                         order_by="OrderItem.id")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'order_no', name='uq_orders_tenant_order_no'),
        CheckConstraint("payment_method IN ('cod', 'online')", name='orders_payment_method_check'),
        Index('idx_orders_tenant_status', 'tenant_id', 'status'),
    )

    def __repr__(self):
        return f"<Order(id={self.id}, no={self.order_no}, status={self.status})>"


class OrderItem(Base):
    """Order line at the price shown when ordering"""

    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey('orders.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    is_loose = Column(Boolean, nullable=False, default=False)
    unit_type = Column(String(50))
    quantity = Column(Numeric(12, 3), nullable=False)
    # Set when packed: weighed quantity for loose items, lower or 0 when short
    packed_quantity = Column(Numeric(12, 3))
    mrp = Column(Numeric(10, 2))
    unit_price = Column(Numeric(10, 2), nullable=False)
    offer_price = Column(Numeric(10, 2), nullable=False)
    discount_source = Column(String(20))
    offer_name = Column(String(200))
    line_total = Column(Numeric(12, 2), nullable=False)

    order = relationship("Order", back_populates="items")
