"""
Stock movement model for inventory tracking
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class StockMovement(Base):
    """Stock movement model for tracking inventory changes"""
    
    __tablename__ = "stock_movements"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey('product_batches.id'), index=True)
    movement_type = Column(String(50), nullable=False)  # purchase_in, sale_out, adjustment_in, etc.
    quantity = Column(Numeric(12, 3), nullable=False)
    reference_type = Column(String(50))  # purchase, sale, adjustment
    reference_id = Column(Integer)  # ID of the related record
    remarks = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="stock_movements")
    product = relationship("Product", back_populates="stock_movements")

    @property
    def product_name(self):
        return self.product.product_name if self.product else None

    # Valid movement types
    MOVEMENT_TYPES = [
        'purchase_in',
        'sale_out',
        'adjustment_in',
        'adjustment_out',
        'damage_out',
        'expired_out',
        'return_in'
    ]
    
    def __repr__(self):
        return f"<StockMovement(id={self.id}, type={self.movement_type}, qty={self.quantity})>"

