"""
Category schemas
"""
from typing import Optional, List, Literal
from pydantic import BaseModel
from app.schemas.base import TimestampSchema


class CategoryBase(BaseModel):
    """Base category schema"""
    category_name: str
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    """Schema for creating a category"""
    pass


class CategoryUpdate(BaseModel):
    """Schema for updating a category"""
    category_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "inactive"]] = None


class CategoryResponse(CategoryBase, TimestampSchema):
    """Schema for category response"""
    id: int
    tenant_id: int
    status: str


class CategoryListResponse(BaseModel):
    """Schema for category list response"""
    items: List[CategoryResponse]
    total: int
    page: int
    page_size: int

