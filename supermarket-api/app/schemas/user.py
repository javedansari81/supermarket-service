"""
User schemas
"""
from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.schemas.base import BaseSchema, TimestampSchema


class UserBase(BaseModel):
    """Base user schema"""
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    contact_no: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a user"""
    password: str = Field(..., min_length=6)
    role_id: int

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v


class UserUpdate(BaseModel):
    """Schema for updating a user"""
    email: Optional[str] = None
    full_name: Optional[str] = None
    contact_no: Optional[str] = None
    role_id: Optional[int] = None
    status: Optional[Literal["active", "inactive"]] = None


class RoleResponse(BaseModel):
    """Schema for role in user response"""
    id: int
    role_name: str
    
    model_config = {"from_attributes": True}


class UserResponse(UserBase, TimestampSchema):
    """Schema for user response"""
    id: int
    tenant_id: int
    role_id: int
    status: str
    last_login: Optional[datetime] = None
    role: Optional[RoleResponse] = None


class UserListResponse(BaseModel):
    """Schema for user list response"""
    items: List[UserResponse]
    total: int
    page: int
    page_size: int

