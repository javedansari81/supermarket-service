"""
Category management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryListResponse
from app.api.deps import get_current_user, get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("", response_model=CategoryListResponse)
async def list_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List categories for current tenant
    """
    query = db.query(Category).filter(Category.tenant_id == context.tenant_id)
    
    if status:
        query = query.filter(Category.status == status)
    
    if search:
        query = query.filter(Category.category_name.ilike(f"%{search}%"))
    
    total = query.count()
    items = query.order_by(Category.category_name).offset((page - 1) * page_size).limit(page_size).all()
    
    return CategoryListResponse(
        items=[CategoryResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/active")
async def list_active_categories(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List active categories (for dropdowns)
    """
    categories = db.query(Category).filter(
        Category.tenant_id == context.tenant_id,
        Category.status == "active"
    ).order_by(Category.category_name).all()
    
    return [{"id": c.id, "category_name": c.category_name} for c in categories]


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get category by ID
    """
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.tenant_id == context.tenant_id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return CategoryResponse.model_validate(category)


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new category (admin only)
    """
    # Check if category name already exists for this tenant
    existing = db.query(Category).filter(
        Category.tenant_id == context.tenant_id,
        Category.category_name == category_data.category_name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")
    
    category = Category(
        tenant_id=context.tenant_id,
        category_name=category_data.category_name,
        description=category_data.description,
        created_by=context.user_id
    )
    
    db.add(category)
    db.commit()
    db.refresh(category)
    
    return CategoryResponse.model_validate(category)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a category (admin only)
    """
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.tenant_id == context.tenant_id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check for duplicate name if updating name
    if category_data.category_name and category_data.category_name != category.category_name:
        existing = db.query(Category).filter(
            Category.tenant_id == context.tenant_id,
            Category.category_name == category_data.category_name,
            Category.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category name already exists")
    
    update_data = category_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
    
    category.updated_by = context.user_id
    db.commit()
    db.refresh(category)
    
    return CategoryResponse.model_validate(category)

