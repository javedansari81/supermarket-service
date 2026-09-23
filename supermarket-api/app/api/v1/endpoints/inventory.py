"""
Inventory management endpoints
"""
from typing import Optional
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.schemas.stock import (
    StockMovementCreate, StockMovementResponse, StockMovementListResponse,
    StockAdjustment, StockSummary, StockReport
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("/stock")
async def get_stock_summary(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    category_id: Optional[int] = None,
    low_stock_only: bool = False,
    out_of_stock_only: bool = False,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get stock summary for all products
    """
    query = db.query(Product).options(joinedload(Product.category)).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active"
    )
    
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    if low_stock_only:
        query = query.filter(Product.stock_quantity <= Product.reorder_level)
    
    if out_of_stock_only:
        query = query.filter(Product.stock_quantity <= 0)
    
    if search:
        query = query.filter(
            (Product.product_name.ilike(f"%{search}%")) |
            (Product.product_no.ilike(f"%{search}%"))
        )
    
    total = query.count()
    products = query.order_by(Product.product_name).offset((page - 1) * page_size).limit(page_size).all()
    
    items = []
    for p in products:
        items.append(StockSummary(
            id=p.id,
            product_id=p.id,
            product_no=p.product_no,
            product_name=p.product_name,
            barcode=p.barcode,
            category_name=p.category.category_name if p.category else None,
            current_stock=p.stock_quantity or Decimal("0"),
            stock_quantity=p.stock_quantity or Decimal("0"),
            reorder_level=p.reorder_level or Decimal("0"),
            unit_type=p.unit_type or "pcs",
            is_low_stock=(p.stock_quantity or 0) <= (p.reorder_level or 0)
        ))
    
    # Get counts
    low_stock_count = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active",
        Product.stock_quantity <= Product.reorder_level,
        Product.stock_quantity > 0
    ).count()
    
    out_of_stock_count = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active",
        Product.stock_quantity <= 0
    ).count()
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count
    }


@router.get("/movements", response_model=StockMovementListResponse)
async def list_stock_movements(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List stock movements
    """
    query = db.query(StockMovement).options(joinedload(StockMovement.product)).filter(
        StockMovement.tenant_id == context.tenant_id
    )
    
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    
    if from_date:
        query = query.filter(func.date(StockMovement.created_at) >= from_date)
    
    if to_date:
        query = query.filter(func.date(StockMovement.created_at) <= to_date)
    
    total = query.count()
    items = query.order_by(StockMovement.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return StockMovementListResponse(
        items=[StockMovementResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("/adjust")
async def adjust_stock(
    adjustment: StockAdjustment,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Adjust stock (admin only)
    """
    valid_types = ["adjustment_in", "adjustment_out", "damage_out", "expired_out"]
    if adjustment.adjustment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid adjustment type. Must be one of: {valid_types}")
    
    product = db.query(Product).filter(
        Product.id == adjustment.product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Update stock
    if adjustment.adjustment_type in ["adjustment_in"]:
        product.stock_quantity = (product.stock_quantity or 0) + adjustment.quantity
    else:
        if adjustment.quantity > (product.stock_quantity or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot remove {adjustment.quantity}; only {product.stock_quantity or 0} in stock"
            )
        product.stock_quantity = (product.stock_quantity or 0) - adjustment.quantity
    
    # Create stock movement
    movement = StockMovement(
        tenant_id=context.tenant_id,
        product_id=adjustment.product_id,
        movement_type=adjustment.adjustment_type,
        quantity=adjustment.quantity,
        reference_type="adjustment",
        remarks=adjustment.remarks,
        created_by=context.user_id
    )
    db.add(movement)
    db.commit()
    
    return {"message": "Stock adjusted successfully", "new_stock": float(product.stock_quantity)}

