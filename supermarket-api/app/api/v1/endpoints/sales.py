"""
Sales/Billing endpoints
"""
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.invoice import Invoice
from app.models.tenant_setting import TenantSetting
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleListResponse
from app.api.deps import get_current_user, get_tenant_context, TenantContext
from app.api.v1.endpoints.settings import build_store_settings
from app.api.v1.endpoints.invoices import create_invoice_for_sale, format_place_of_supply
from app.api.v1.endpoints.customers import upsert_customer_for_sale

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


def to_sale_response(sale: Sale) -> SaleResponse:
    """Build sale response including the linked invoice"""
    response = SaleResponse.model_validate(sale)
    if sale.invoice:
        response.invoice_id = sale.invoice.id
        response.invoice_no = sale.invoice.invoice_no
    return response


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
        items=[to_sale_response(item) for item in items],
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

    return to_sale_response(sale)


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    sale_data: SaleCreate,
    request: Request,
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

    # MRP/selling price in Indian retail is GST-inclusive unless configured otherwise
    tax_inclusive = get_setting(db, context.tenant_id, "tax_inclusive_pricing", "true").lower() == "true"

    # Intra-state supply -> CGST + SGST; inter-state -> IGST
    store = build_store_settings(db, context.tenant_id)
    store_state_code = store.store_state_code or ""
    place_code = sale_data.place_of_supply_code or store_state_code
    is_interstate = bool(store_state_code and place_code and place_code != store_state_code)
    if sale_data.customer_gstin and not sale_data.customer_name:
        raise HTTPException(status_code=400, detail="Customer name is required for a B2B (GSTIN) invoice")

    customer = None
    if sale_data.customer_phone:
        customer = upsert_customer_for_sale(
            db, context.tenant_id, sale_data.customer_phone,
            sale_data.customer_name, sale_data.customer_gstin
        )
        db.flush()

    # Initialize totals
    subtotal = Decimal("0")
    total_tax = Decimal("0")
    total_discount = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    # Create sale
    sale = Sale(
        tenant_id=context.tenant_id,
        sale_no=sale_no,
        sale_date=datetime.utcnow(),
        payment_mode=sale_data.payment_mode,
        customer_name=sale_data.customer_name,
        customer_phone=sale_data.customer_phone,
        customer_gstin=sale_data.customer_gstin,
        customer_id=customer.id if customer else None,
        place_of_supply=format_place_of_supply(place_code),
        is_interstate=is_interstate,
        remarks=sale_data.remarks,
        created_by=context.user_id
    )
    db.add(sale)
    db.flush()
    
    # Process items
    sale_items = []
    for item_data in sale_data.items:
        product = db.query(Product).filter(
            Product.id == item_data.product_id,
            Product.tenant_id == context.tenant_id,
            Product.status == "active"
        ).with_for_update().first()
        
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item_data.product_id} not found")
        
        if item_data.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid quantity for {product.product_name}")
        if not product.is_loose and item_data.quantity != item_data.quantity.to_integral_value():
            raise HTTPException(
                status_code=400,
                detail=f"{product.product_name} is a packed item; quantity must be a whole number"
            )

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
        cents = Decimal("0.01")
        line_gross = (unit_price * item_data.quantity).quantize(cents)
        discount_amount = (line_gross * discount_percent / 100).quantize(cents)
        net_amount = line_gross - discount_amount
        if tax_inclusive:
            tax_amount = (net_amount * tax_percent / (100 + tax_percent)).quantize(cents)
            line_total = net_amount
        else:
            tax_amount = (net_amount * tax_percent / 100).quantize(cents)
            line_total = net_amount + tax_amount

        if is_interstate:
            cgst_amount = sgst_amount = Decimal("0")
            igst_amount = tax_amount
        else:
            cgst_amount = (tax_amount / 2).quantize(cents)
            sgst_amount = tax_amount - cgst_amount
            igst_amount = Decimal("0")

        # Create sale item
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=product.id,
            product_name=product.product_name,
            barcode=product.barcode,
            hsn_code=product.hsn_code,
            unit_type=product.unit_type,
            mrp=product.mrp,
            quantity=item_data.quantity,
            unit_price=unit_price,
            taxable_value=line_total - tax_amount,
            tax_percent=tax_percent,
            tax_amount=tax_amount,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            igst_amount=igst_amount,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            line_total=line_total
        )
        db.add(sale_item)
        sale_items.append(sale_item)

        # Update totals (subtotal excludes tax, before discount)
        subtotal += line_total - tax_amount + discount_amount
        total_tax += tax_amount
        total_discount += discount_amount
        total_cgst += cgst_amount
        total_sgst += sgst_amount
        total_igst += igst_amount

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
    sale.cgst_amount = total_cgst
    sale.sgst_amount = total_sgst
    sale.igst_amount = total_igst
    db.flush()

    # Create tax invoice
    invoice = create_invoice_for_sale(db, sale, context.tenant_id)

    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "sale", sale.id,
                 new_value={**snapshot(sale), "invoice_no": invoice.invoice_no,
                            "items": [snapshot(i) for i in sale_items]})
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "invoice", invoice.id, new_value={**snapshot(invoice), "sale_no": sale.sale_no})
    db.commit()
    db.refresh(sale)

    return to_sale_response(sale)

