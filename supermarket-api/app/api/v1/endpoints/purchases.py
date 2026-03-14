"""
Purchase/Procurement management endpoints
"""
from typing import Optional
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models.purchase import Purchase, PurchaseItem
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.schemas.purchase import PurchaseCreate, PurchaseUpdate, PurchaseResponse, PurchaseListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_purchase_no(db: Session, tenant_id: int) -> str:
    """Generate unique purchase number"""
    last_purchase = db.query(Purchase).filter(
        Purchase.tenant_id == tenant_id
    ).order_by(Purchase.id.desc()).first()
    
    if last_purchase:
        last_no = int(last_purchase.purchase_no.replace("PO", ""))
        return f"PO{last_no + 1:06d}"
    return "PO000001"


@router.get("", response_model=PurchaseListResponse)
async def list_purchases(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List purchases for current tenant
    """
    query = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(Purchase.tenant_id == context.tenant_id)
    
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    
    if status:
        query = query.filter(Purchase.status == status)
    
    if from_date:
        query = query.filter(Purchase.purchase_date >= from_date)
    
    if to_date:
        query = query.filter(Purchase.purchase_date <= to_date)
    
    total = query.count()
    items = query.order_by(Purchase.purchase_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return PurchaseListResponse(
        items=[PurchaseResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{purchase_id}", response_model=PurchaseResponse)
async def get_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get purchase by ID
    """
    purchase = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(
        Purchase.id == purchase_id,
        Purchase.tenant_id == context.tenant_id
    ).first()
    
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    return PurchaseResponse.model_validate(purchase)


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    purchase_data: PurchaseCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new purchase and update stock (admin only)
    """
    # Generate purchase number
    purchase_no = generate_purchase_no(db, context.tenant_id)
    
    # Calculate total amount
    total_amount = Decimal("0")
    
    # Create purchase
    purchase = Purchase(
        tenant_id=context.tenant_id,
        purchase_no=purchase_no,
        supplier_id=purchase_data.supplier_id,
        supplier_invoice_no=purchase_data.supplier_invoice_no,
        purchase_date=purchase_data.purchase_date,
        remarks=purchase_data.remarks,
        created_by=context.user_id
    )
    db.add(purchase)
    db.flush()
    
    # Add purchase items and update stock
    for item_data in purchase_data.items:
        product = db.query(Product).filter(
            Product.id == item_data.product_id,
            Product.tenant_id == context.tenant_id
        ).first()
        
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item_data.product_id} not found")
        
        item_total = item_data.quantity * item_data.unit_cost
        total_amount += item_total
        
        # Create purchase item
        purchase_item = PurchaseItem(
            purchase_id=purchase.id,
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            unit_cost=item_data.unit_cost,
            total_cost=item_total
        )
        db.add(purchase_item)
        
        # Update product stock
        product.stock_quantity = (product.stock_quantity or 0) + item_data.quantity
        product.purchase_price = item_data.unit_cost
        
        # Create stock movement
        stock_movement = StockMovement(
            tenant_id=context.tenant_id,
            product_id=item_data.product_id,
            movement_type="purchase_in",
            quantity=item_data.quantity,
            reference_type="purchase",
            reference_id=purchase.id,
            created_by=context.user_id
        )
        db.add(stock_movement)
    
    purchase.total_amount = total_amount
    db.commit()
    db.refresh(purchase)
    
    return PurchaseResponse.model_validate(purchase)

