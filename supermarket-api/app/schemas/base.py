"""
Base schemas with common configurations
"""
from datetime import datetime
from typing import Optional, List, Generic, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar('T')


class BaseSchema(BaseModel):
    """Base schema with common configuration"""
    model_config = ConfigDict(from_attributes=True)


class TimestampSchema(BaseSchema):
    """Schema with timestamp fields"""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response"""
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Simple message response"""
    message: str
    success: bool = True

