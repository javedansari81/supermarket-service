"""
Barcode configuration model
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class BarcodeConfig(Base, TimestampMixin):
    """Barcode configuration model for label printing settings"""
    
    __tablename__ = "barcode_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    config_name = Column(String(100), nullable=False)
    barcode_format = Column(String(50), default='code128')
    label_width = Column(Numeric(5, 2), default=50)
    label_height = Column(Numeric(5, 2), default=30)
    show_store_name = Column(Boolean, default=True)
    show_product_no = Column(Boolean, default=True)
    show_mrp = Column(Boolean, default=True)
    show_barcode = Column(Boolean, default=True)
    font_size = Column(Integer, default=10)
    is_default = Column(Boolean, default=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="barcode_configs")
    
    # Unique constraint on tenant_id + config_name
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<BarcodeConfig(id={self.id}, name={self.config_name}, tenant_id={self.tenant_id})>"

