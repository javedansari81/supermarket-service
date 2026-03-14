"""
Authentication schemas
"""
from typing import Optional
from pydantic import BaseModel


class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int
    username: str
    role: str
    tenant_id: int
    tenant_name: str


class TokenData(BaseModel):
    """Token payload data"""
    user_id: Optional[int] = None
    username: Optional[str] = None
    tenant_id: Optional[int] = None
    role: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request schema"""
    username: str
    password: str


class PasswordChange(BaseModel):
    """Password change request"""
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    """Password reset by admin"""
    new_password: str

