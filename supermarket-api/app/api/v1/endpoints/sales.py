"""
Sales/Billing endpoints
"""
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.batches import sync_batches, uses_batches, distinct_mrps, allocate, get_product_batch
from app.core.clearance import ClearanceResolver
from app.core.offers import OfferResolver, LineDiscount, resolve_line_discount, CENTS
from app.core.coupons import (SOURCE_COUPON, CouponLine, find_coupon, check_coupon,
                              allocate_coupon)
from app.core.loyalty import (POINTS_MODE, get_loyalty_settings, lock_customer, expire_if_due,
                              post_points, points_to_earn, points_to_redeem)
from app.models.audit_log import AuditLog
from app.models.loyalty_transaction import LoyaltyTransaction
from app.models.sale import Sale, SaleItem, SalePayment
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.models.stock_movement import StockMovement
from app.models.invoice import Invoice
from app.models.tenant_setting import TenantSetting
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleListResponse
from app.schemas.coupon import CouponCheckRequest, CouponCheckResponse, CouponCheckItem
from app.api.deps import get_current_user, get_tenant_context, TenantContext
from app.api.v1.endpoints.settings import build_store_settings
from app.api.v1.endpoints.invoices import create_invoice_for_sale, format_place_of_supply
from app.api.v1.endpoints.customers import upsert_customer_for_sale
from app.api.v1.endpoints.held_bills import held_bill_query
from app.models.held_bill import HeldBill

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


def pick_batches(db: Session, product: Product, item_data):
    """[(batch, quantity)] a sale line is taken from; [(None, quantity)] for loose items.
    A chosen batch must cover the quantity; otherwise stock is taken first expiry first,
    which needs every in-stock batch to have the same MRP."""
    if not uses_batches(product):
        return [(None, item_data.quantity)]
    batches = sync_batches(db, product)
    if item_data.batch_id:
        batch = get_product_batch(db, product, item_data.batch_id)
        if batch.quantity_left < item_data.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.product_name} (MRP {batch.mrp}): "
                       f"only {batch.quantity_left.normalize():f} left in this batch"
            )
        return [(batch, item_data.quantity)]
    if len(distinct_mrps(batches)) > 1:
        raise HTTPException(
            status_code=409,
            detail=f"{product.product_name} is in stock at different MRPs; select the MRP batch"
        )
    try:
        return allocate(batches, item_data.quantity)
    except HTTPException:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.product_name}")


@dataclass
class PricedLine:
    """One sale line (per batch) before tax, with its own discount and purchase cost"""
    index: int
    product: Product
    batch: Optional[ProductBatch]
    quantity: Decimal
    unit_price: Decimal
    mrp: Optional[Decimal]
    gross: Decimal
    discount: LineDiscount
    unit_cost: Optional[Decimal]


def price_lines(db: Session, tenant_id: int, items) -> List[PricedLine]:
    """Checks products and stock, picks batches and takes the stock off (callers that don't
    sell roll back), and gives each line its near-expiry or offer discount"""
    clearance = ClearanceResolver(db, tenant_id)
    offers = OfferResolver(db, tenant_id)
    lines = []
    for index, item_data in enumerate(items):
        product = db.query(Product).filter(
            Product.id == item_data.product_id,
            Product.tenant_id == tenant_id,
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

        # One sale line per batch the quantity is taken from
        for batch, quantity in pick_batches(db, product, item_data):
            clearance_percent = Decimal("0") if item_data.skip_clearance \
                else clearance.percent(product, batch)
            if batch:
                unit_price = batch.selling_price or batch.mrp or product.selling_price \
                    or product.mrp or Decimal("0")
                mrp = batch.mrp
                unit_cost = batch.purchase_price or product.purchase_price
            else:
                unit_price = product.selling_price or product.mrp or Decimal("0")
                mrp = product.mrp
                unit_cost = product.purchase_price

            line_gross = (unit_price * quantity).quantize(CENTS)
            discount = resolve_line_discount(line_gross, quantity, unit_price, clearance_percent,
                                             offers.best(product.id, unit_price))
            lines.append(PricedLine(index, product, batch, quantity, unit_price, mrp, line_gross,
                                    discount, unit_cost))

            # Deduct stock
            product.stock_quantity = (product.stock_quantity or 0) - quantity
            if batch:
                batch.quantity_left -= quantity
    return lines


def apply_coupon(db: Session, tenant_id: int, code: str, customer_phone: Optional[str],
                 lines: List[PricedLine], lock: bool = False):
    """Checks the coupon for this bill and gives it the lines where it saves more"""
    coupon = find_coupon(db, tenant_id, code, lock=lock)
    bill_amount = sum((l.gross - l.discount.amount for l in lines), Decimal("0"))
    check_coupon(db, coupon, customer_phone, bill_amount)
    coupon_lines = [CouponLine(l.gross, l.quantity, l.discount.amount,
                               Decimal(l.unit_cost) if l.unit_cost else None) for l in lines]
    result = allocate_coupon(coupon, coupon_lines)
    for line, coupon_line in zip(lines, coupon_lines):
        if coupon_line.amount > 0:
            percent = (coupon_line.amount * 100 / line.gross).quantize(CENTS)
            line.discount = LineDiscount(percent, coupon_line.amount, SOURCE_COUPON)
    return coupon, result


def resolve_payments(sale_data: SaleCreate, total: Decimal):
    """Payment rows (mode, amount, reference), the sale's payment_mode, cash tendered and change"""
    total = Decimal(total).quantize(Decimal("0.01"))
    if sale_data.payments is not None:
        rows = [(p.mode, p.amount, p.reference) for p in sale_data.payments]
        paid = sum((amount for _, amount, _ in rows), Decimal("0"))
        if paid != total:
            raise HTTPException(
                status_code=400,
                detail=f"Payments add up to ₹{paid:.2f} but the bill total is ₹{total:.2f}"
            )
    else:
        rows = [(sale_data.payment_mode, total, None)] if total > 0 else []

    payment_mode = rows[0][0] if len(rows) == 1 else ("split" if rows else sale_data.payment_mode)
    cash = sum((amount for mode, amount, _ in rows if mode == "cash"), Decimal("0"))
    tendered = sale_data.cash_tendered
    if tendered is None:
        return rows, payment_mode, None, None
    if cash <= 0:
        raise HTTPException(status_code=400, detail="Cash tendered needs a cash payment")
    if tendered < cash:
        raise HTTPException(
            status_code=400,
            detail=f"Cash tendered ₹{tendered:.2f} is less than the cash amount ₹{cash:.2f}"
        )
    return rows, payment_mode, tendered, tendered - cash


def to_sale_response(sale: Sale) -> SaleResponse:
    """Build sale response including the linked invoice"""
    response = SaleResponse.model_validate(sale)
    if sale.invoice:
        response.invoice_id = sale.invoice.id
        response.invoice_no = sale.invoice.invoice_no
    return response


@router.post("/coupon-check", response_model=CouponCheckResponse)
async def check_sale_coupon(
    data: CouponCheckRequest,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    What a coupon takes off this cart, per cart line; nothing is saved
    """
    try:
        lines = price_lines(db, context.tenant_id, data.items)
        coupon, result = apply_coupon(db, context.tenant_id, data.code, data.customer_phone, lines)
        per_item = [Decimal("0")] * len(data.items)
        for line in lines:
            if line.discount.source == SOURCE_COUPON:
                per_item[line.index] += line.discount.amount
        return CouponCheckResponse(
            code=coupon.code,
            description=coupon.description,
            discount_type=coupon.discount_type,
            discount_value=coupon.discount_value,
            coupon_discount=result.discount,
            saving=result.saving,
            items=[CouponCheckItem(index=i, coupon_amount=a) for i, a in enumerate(per_item)],
            notes=result.notes,
        )
    finally:
        db.rollback()


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
    query = db.query(Sale).options(joinedload(Sale.items), selectinload(Sale.payments)).filter(
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

    lines = price_lines(db, context.tenant_id, sale_data.items)
    coupon = None
    coupon_result = None
    if sale_data.coupon_code:
        coupon, coupon_result = apply_coupon(db, context.tenant_id, sale_data.coupon_code,
                                             sale_data.customer_phone, lines, lock=True)

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
        coupon_id=coupon.id if coupon else None,
        coupon_code=coupon.code if coupon else None,
        coupon_discount=coupon_result.discount if coupon_result else Decimal("0"),
        remarks=sale_data.remarks,
        created_by=context.user_id
    )
    db.add(sale)
    db.flush()

    # Process items
    sale_items = []
    for line in lines:
        product, batch, quantity, discount = line.product, line.batch, line.quantity, line.discount
        tax_percent = product.tax_percent or Decimal("0")

        # Calculate amounts
        discount_amount = discount.amount
        net_amount = line.gross - discount_amount
        if tax_inclusive:
            tax_amount = (net_amount * tax_percent / (100 + tax_percent)).quantize(CENTS)
            line_total = net_amount
        else:
            tax_amount = (net_amount * tax_percent / 100).quantize(CENTS)
            line_total = net_amount + tax_amount

        if is_interstate:
            cgst_amount = sgst_amount = Decimal("0")
            igst_amount = tax_amount
        else:
            cgst_amount = (tax_amount / 2).quantize(CENTS)
            sgst_amount = tax_amount - cgst_amount
            igst_amount = Decimal("0")

        # Create sale item
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=product.id,
            batch_id=batch.id if batch else None,
            product_name=product.product_name,
            barcode=product.barcode,
            hsn_code=product.hsn_code,
            unit_type=product.unit_type,
            mrp=line.mrp,
            quantity=quantity,
            unit_price=line.unit_price,
            unit_cost=line.unit_cost,
            taxable_value=line_total - tax_amount,
            tax_percent=tax_percent,
            tax_amount=tax_amount,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            igst_amount=igst_amount,
            discount_percent=discount.percent,
            discount_amount=discount_amount,
            discount_source=discount.source,
            offer_id=discount.offer.offer_id if discount.offer else None,
            offer_name=discount.offer.offer.name if discount.offer else None,
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

        # Create stock movement
        movement = StockMovement(
            tenant_id=context.tenant_id,
            product_id=product.id,
            batch_id=batch.id if batch else None,
            movement_type="sale_out",
            quantity=quantity,
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

    rows, sale.payment_mode, sale.cash_tendered, sale.change_given = resolve_payments(
        sale_data, sale.total_amount
    )
    payments = [SalePayment(tenant_id=context.tenant_id, sale_id=sale.id, mode=mode,
                            amount=amount, reference=reference)
                for mode, amount, reference in rows]
    db.add_all(payments)
    db.flush()

    # Loyalty: redeem the 'points' payment, earn on the rest of the bill
    loyalty = get_loyalty_settings(db, context.tenant_id)
    points_amount = sum((amount for mode, amount, _ in rows if mode == POINTS_MODE), Decimal("0"))
    if customer and loyalty.enabled:
        customer = lock_customer(db, context.tenant_id, customer.id)
        expire_if_due(db, customer, loyalty, context.user_id)
        if points_amount:
            sale.points_redeemed = points_to_redeem(points_amount, sale.total_amount,
                                                    customer, loyalty)
            post_points(db, customer, LoyaltyTransaction.TYPE_REDEEM, -sale.points_redeemed,
                        context.user_id, sale_id=sale.id, touch=True)
        sale.points_earned = points_to_earn(sale.total_amount - points_amount, loyalty)
        post_points(db, customer, LoyaltyTransaction.TYPE_EARN, sale.points_earned,
                    context.user_id, sale_id=sale.id, touch=bool(sale.points_earned))
        db.flush()
    elif points_amount:
        points_to_redeem(points_amount, sale.total_amount, customer, loyalty)

    # Create tax invoice
    invoice = create_invoice_for_sale(db, sale, context.tenant_id)

    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "sale", sale.id,
                 new_value={**snapshot(sale), "invoice_no": invoice.invoice_no,
                            "items": [snapshot(i) for i in sale_items],
                            "payments": [snapshot(p) for p in payments]})
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "invoice", invoice.id, new_value={**snapshot(invoice), "sale_no": sale.sale_no})

    # A recalled held bill is done once it is sold
    if sale_data.held_bill_id:
        held = held_bill_query(db, context).filter(HeldBill.id == sale_data.held_bill_id).first()
        if held:
            db.delete(held)
    db.commit()
    db.refresh(sale)

    response = to_sale_response(sale)
    if customer:
        response.points_balance = customer.points_balance
    return response

