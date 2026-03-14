"""
User model for authentication and authorization
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, StatusMixin


class User(Base, TimestampMixin, StatusMixin):
    """User model for system users (admin, cashier)"""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey('roles.id'), nullable=False, index=True)
    username = Column(String(100), nullable=False)
    email = Column(String(100))
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(200))
    contact_no = Column(String(20))
    last_login = Column(DateTime)
    created_by = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    role = relationship("Role", back_populates="users")
    
    # Unique constraint on tenant_id + username
    __table_args__ = (
        {'extend_existing': True}
    )
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, tenant_id={self.tenant_id})>"

