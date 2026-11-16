"""
Repack model: loose stock packed into own-packed products (e.g. Toor Dal Loose -> 1 kg / 500 g packs)
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, Date, DateTime, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Repack(Base):
    """One repack; quantities are in the loose product's unit"""

    __tablename__ = "repacks"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    repack_no = Column(String(30), nullable=False)
    source_product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    packed_quantity = Column(Numeric(12, 3), nullable=False)
    wastage_enabled = Column(Boolean, nullable=False, default=True, server_default='true')
    wastage_quantity = Column(Numeric(12, 3), nullable=False, default=0, server_default='0')
    total_quantity = Column(Numeric(12, 3), nullable=False)
    source_unit_cost = Column(Numeric(10, 2))
    expiry_date = Column(Date)
    remarks = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_product = relationship("Product")
    items = relationship("RepackItem", back_populates="repack", cascade="all, delete-orphan",
                         order_by="RepackItem.id")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'repack_no', name='uq_repacks_tenant_no'),
        {'extend_existing': True}
    )

    def __repr__(self):
        return f"<Repack(id={self.id}, no={self.repack_no}, total={self.total_quantity})>"


class RepackItem(Base):
    """Packs of one own-packed product made in a repack"""

    __tablename__ = "repack_items"

    id = Column(Integer, primary_key=True, index=True)
    repack_id = Column(Integer, ForeignKey('repacks.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    batch_id = Column(Integer, ForeignKey('product_batches.id'))
    pack_count = Column(Integer, nullable=False)
    source_quantity = Column(Numeric(12, 3), nullable=False)
    unit_cost = Column(Numeric(10, 2))

    repack = relationship("Repack", back_populates="items")
    product = relationship("Product")
