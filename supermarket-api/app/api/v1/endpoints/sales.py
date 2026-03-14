"""
Sales/Billing endpoints
"""
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.invoice import Invoice
from app.models.tenant_setting import TenantSetting
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleListResponse
from app.api.deps import get_current_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_sale_no(db: Session, tenant_id: int) -> str:
    """Generate unique sale number"""
    today = datetime.now().strftime("%Y%m%d")
    last_sale = db.query(Sale).filter(
        Sale.tenant_id == tenant_id,
        Sale.sale_no.like(f"S{today}%")
    ).order_by(Sale.id.desc()).first()
    
    if last_sale:
        last_seq = int(last_sale.sale_no[-4:])
        return f"S{today}{last_seq + 1:04d}"
    return f"S{today}0001"


def get_setting(db: Session, tenant_id: int, key: str, default: str = "") -> str:
    """Get tenant setting value"""
    setting = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == key
    ).first()
    return setting.setting_value if setting else default


@router.get("", response_model=SaleListResponse)
async def list_sales(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    status: Optional[str] = None,
    cashier_id: Optional[int] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List sales for current tenant
    """
    query = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.tenant_id == context.tenant_id
    )
    
    if from_date:
        query = query.filter(func.date(Sale.sale_date) >= from_date)
    
    if to_date:
        query = query.filter(func.date(Sale.sale_date) <= to_date)
    
    if status:
        query = query.filter(Sale.status == status)
    
    if cashier_id:
        query = query.filter(Sale.created_by == cashier_id)
    
    total = query.count()
    items = query.order_by(Sale.sale_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return SaleListResponse(
        items=[SaleResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get sale by ID
    """
    sale = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.id == sale_id,
        Sale.tenant_id == context.tenant_id
    ).first()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    return SaleResponse.model_validate(sale)


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    sale_data: SaleCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new sale (billing transaction)
    """
    if not sale_data.items:
        raise HTTPException(status_code=400, detail="Sale must have at least one item")
    
    # Generate sale number
    sale_no = generate_sale_no(db, context.tenant_id)
    
    # Initialize totals
    subtotal = Decimal("0")
    total_tax = Decimal("0")
    total_discount = Decimal("0")
    
    # Create sale
    sale = Sale(
        tenant_id=context.tenant_id,
        sale_no=sale_no,
        sale_date=datetime.utcnow(),
        payment_mode=sale_data.payment_mode,
        customer_name=sale_data.customer_name,
        customer_phone=sale_data.customer_phone,
        remarks=sale_data.remarks,
        created_by=context.user_id
    )
    db.add(sale)
    db.flush()
    
    # Process items
    for item_data in sale_data.items:
        product = db.query(Product).filter(
            Product.id == item_data.product_id,
            Product.tenant_id == context.tenant_id,
            Product.status == "active"
        ).first()
        
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item_data.product_id} not found")
        
        # Check stock
        if (product.stock_quantity or 0) < item_data.quantity:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock for {product.product_name}"
            )
        
        unit_price = product.selling_price or product.mrp or Decimal("0")
        tax_percent = product.tax_percent or Decimal("0")
        discount_percent = item_data.discount_percent or Decimal("0")
        
        # Calculate amounts
        line_subtotal = unit_price * item_data.quantity
        discount_amount = line_subtotal * (discount_percent / 100)
        taxable_amount = line_subtotal - discount_amount
        tax_amount = taxable_amount * (tax_percent / 100)
        line_total = taxable_amount + tax_amount
        
        # Create sale item
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=product.id,
            product_name=product.product_name,
            barcode=product.barcode,
            quantity=item_data.quantity,
            unit_price=unit_price,
            tax_percent=tax_percent,
            tax_amount=tax_amount,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            line_total=line_total
        )
        db.add(sale_item)
        
        # Update totals
        subtotal += line_subtotal
        total_tax += tax_amount
        total_discount += discount_amount
        
        # Deduct stock
        product.stock_quantity = (product.stock_quantity or 0) - item_data.quantity
        
        # Create stock movement
        movement = StockMovement(
            tenant_id=context.tenant_id,
            product_id=product.id,
            movement_type="sale_out",
            quantity=item_data.quantity,
            reference_type="sale",
            reference_id=sale.id,
            created_by=context.user_id
        )
        db.add(movement)
    
    # Update sale totals
    sale.subtotal = subtotal
    sale.tax_amount = total_tax
    sale.discount_amount = total_discount
    sale.total_amount = subtotal - total_discount + total_tax
    
    db.commit()
    db.refresh(sale)
    
    return SaleResponse.model_validate(sale)

