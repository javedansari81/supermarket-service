"""
Purchase/Procurement management endpoints
"""
from typing import Optional
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func, cast, Integer
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.models.purchase import Purchase, PurchaseItem
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.stock_movement import StockMovement
from app.schemas.purchase import (
    PurchaseCreate, PurchaseUpdate, PurchaseCancel, PurchaseResponse, PurchaseListResponse
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_purchase_no(db: Session, tenant_id: int) -> str:
    """Generate unique purchase number (PO000001, PO000002, ...)"""
    last_seq = db.query(
        func.max(cast(func.substring(Purchase.purchase_no, 3), Integer))
    ).filter(
        Purchase.tenant_id == tenant_id,
        Purchase.purchase_no.op("~")("^PO[0-9]+$")
    ).scalar() or 0
    return f"PO{last_seq + 1:06d}"


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
    if purchase_data.supplier_id:
        supplier = db.query(Supplier).filter(
            Supplier.id == purchase_data.supplier_id,
            Supplier.tenant_id == context.tenant_id
        ).first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")
        if supplier.status != "active":
            raise HTTPException(status_code=400, detail=f"Supplier {supplier.supplier_name} is inactive")

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


def get_tenant_purchase(db: Session, purchase_id: int, tenant_id: int) -> Purchase:
    purchase = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(
        Purchase.id == purchase_id,
        Purchase.tenant_id == tenant_id
    ).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


def replace_purchase_items(db: Session, purchase: Purchase, new_items, context: TenantContext) -> None:
    """Replace purchase lines and post stock differences as adjustment movements"""
    old_qty: dict = {}
    for item in purchase.items:
        old_qty[item.product_id] = old_qty.get(item.product_id, Decimal("0")) + item.quantity
    new_qty: dict = {}
    for item in new_items:
        new_qty[item.product_id] = new_qty.get(item.product_id, Decimal("0")) + item.quantity

    products = {}
    for product_id in sorted(set(old_qty) | set(new_qty)):
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.tenant_id == context.tenant_id
        ).with_for_update().first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {product_id} not found")
        products[product_id] = product

    remarks = f"Edited purchase {purchase.purchase_no}"
    for product_id, product in products.items():
        delta = new_qty.get(product_id, Decimal("0")) - old_qty.get(product_id, Decimal("0"))
        if delta == 0:
            continue
        current_stock = product.stock_quantity or Decimal("0")
        if current_stock + delta < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot reduce {product.product_name} by {-delta}: only {current_stock} "
                       f"in stock (some may already be sold)"
            )
        product.stock_quantity = current_stock + delta
        db.add(StockMovement(
            tenant_id=context.tenant_id,
            product_id=product_id,
            movement_type="adjustment_in" if delta > 0 else "adjustment_out",
            quantity=abs(delta),
            reference_type="purchase",
            reference_id=purchase.id,
            remarks=remarks,
            created_by=context.user_id
        ))

    purchase.items.clear()
    total_amount = Decimal("0")
    for item in new_items:
        item_total = item.quantity * item.unit_cost
        total_amount += item_total
        purchase.items.append(PurchaseItem(
            product_id=item.product_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            total_cost=item_total
        ))
        products[item.product_id].purchase_price = item.unit_cost
    purchase.total_amount = total_amount


@router.put("/{purchase_id}", response_model=PurchaseResponse)
async def update_purchase(
    purchase_id: int,
    purchase_data: PurchaseUpdate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a purchase (admin only). When items are sent they replace the existing
    lines and stock is adjusted by the difference per product.
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled purchase cannot be edited")

    update_data = purchase_data.model_dump(exclude_unset=True, exclude={"items"})
    if "purchase_date" in update_data and update_data["purchase_date"] is None:
        raise HTTPException(status_code=400, detail="Purchase date is required")

    new_supplier_id = update_data.get("supplier_id")
    if new_supplier_id and new_supplier_id != purchase.supplier_id:
        supplier = db.query(Supplier).filter(
            Supplier.id == new_supplier_id,
            Supplier.tenant_id == context.tenant_id
        ).first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")
        if supplier.status != "active":
            raise HTTPException(status_code=400, detail=f"Supplier {supplier.supplier_name} is inactive")

    for field, value in update_data.items():
        setattr(purchase, field, value)

    if purchase_data.items is not None:
        replace_purchase_items(db, purchase, purchase_data.items, context)

    db.commit()
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))


@router.post("/{purchase_id}/cancel", response_model=PurchaseResponse)
async def cancel_purchase(
    purchase_id: int,
    cancel_data: PurchaseCancel,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Cancel a purchase and reverse the stock it added (admin only)
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Purchase is already cancelled")

    reason = (cancel_data.reason or "").strip()
    remarks = f"Cancelled purchase {purchase.purchase_no}" + (f": {reason}" if reason else "")

    for item in purchase.items:
        product = db.query(Product).filter(
            Product.id == item.product_id,
            Product.tenant_id == context.tenant_id
        ).with_for_update().first()
        current_stock = product.stock_quantity or 0
        if current_stock < item.quantity:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel: {product.product_name} has only {current_stock} in stock "
                       f"but this purchase added {item.quantity} (some may already be sold)"
            )
        product.stock_quantity = current_stock - item.quantity
        db.add(StockMovement(
            tenant_id=context.tenant_id,
            product_id=item.product_id,
            movement_type="adjustment_out",
            quantity=item.quantity,
            reference_type="purchase",
            reference_id=purchase.id,
            remarks=remarks,
            created_by=context.user_id
        ))

    purchase.status = "cancelled"
    if reason:
        purchase.remarks = f"{purchase.remarks}\n{remarks}" if purchase.remarks else remarks
    db.commit()
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))

