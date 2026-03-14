"""
Product management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse, 
    ProductListResponse, ProductSearchResponse
)
from app.api.deps import get_current_user, get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("", response_model=ProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    low_stock: Optional[bool] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List products for current tenant
    """
    query = db.query(Product).options(joinedload(Product.category)).filter(
        Product.tenant_id == context.tenant_id
    )
    
    if status:
        query = query.filter(Product.status == status)
    
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    if search:
        query = query.filter(
            (Product.product_name.ilike(f"%{search}%")) |
            (Product.product_no.ilike(f"%{search}%")) |
            (Product.barcode.ilike(f"%{search}%"))
        )
    
    if low_stock:
        query = query.filter(Product.stock_quantity <= Product.reorder_level)
    
    total = query.count()
    items = query.order_by(Product.product_name).offset((page - 1) * page_size).limit(page_size).all()
    
    return ProductListResponse(
        items=[ProductResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/search")
async def search_product(
    barcode: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Search product by barcode or product number (for billing)
    """
    query = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active"
    )
    
    if barcode:
        query = query.filter(Product.barcode == barcode)
    elif product_no:
        query = query.filter(Product.product_no == product_no)
    else:
        raise HTTPException(status_code=400, detail="Provide barcode or product_no")
    
    product = query.first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductSearchResponse(
        id=product.id,
        product_no=product.product_no,
        product_name=product.product_name,
        barcode=product.barcode,
        selling_price=product.selling_price or product.mrp or 0,
        mrp=product.mrp,
        tax_percent=product.tax_percent or 0,
        stock_quantity=product.stock_quantity or 0,
        unit_type=product.unit_type or "pcs"
    )


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get product by ID
    """
    product = db.query(Product).options(joinedload(Product.category)).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductResponse.model_validate(product)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new product (admin only)
    """
    # Check if product_no already exists
    existing = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.product_no == product_data.product_no
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Product number already exists")
    
    # Check if barcode already exists (if provided)
    if product_data.barcode:
        existing_barcode = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.barcode == product_data.barcode
        ).first()
        if existing_barcode:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    product = Product(
        tenant_id=context.tenant_id,
        **product_data.model_dump(),
        created_by=context.user_id
    )
    
    db.add(product)
    db.commit()
    db.refresh(product)
    
    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a product (admin only)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check for duplicate barcode if updating
    if product_data.barcode and product_data.barcode != product.barcode:
        existing = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.barcode == product_data.barcode,
            Product.id != product_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    update_data = product_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)
    
    product.updated_by = context.user_id
    db.commit()
    db.refresh(product)
    
    return ProductResponse.model_validate(product)

