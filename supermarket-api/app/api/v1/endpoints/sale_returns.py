"""
Sale return (credit note) and void sale endpoints.
Cashiers can return items within RETURN_WINDOW_DAYS of the sale and void their own same-day sales;
admins can do both at any time.
"""
from typing import Optional, List, Dict
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn, SaleReturnItem
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.invoice import Invoice
from app.models.user import User
from app.schemas.sale import SaleResponse
from app.schemas.sale_return import (
    SaleReturnCreate, SaleVoidRequest, SaleReturnResponse, SaleReturnListResponse,
    ReturnableSale, ReturnableItem
)
from app.api.deps import get_tenant_context, TenantContext
from app.api.v1.endpoints.reports import IST, IST_OFFSET
from app.api.v1.endpoints.sales import to_sale_response

router = APIRouter()
sales_router = APIRouter()

RETURN_WINDOW_DAYS = 7
CENTS = Decimal("0.01")
AMOUNT_FIELDS = ("taxable_value", "tax_amount", "cgst_amount", "sgst_amount", "igst_amount",
                 "discount_amount", "line_total")


def days_since_sale(sale: Sale) -> int:
    """Whole IST calendar days between the sale and today"""
    return (datetime.now(IST).date() - (sale.sale_date + IST_OFFSET).date()).days


def generate_return_no(db: Session, tenant_id: int) -> str:
    """Generate unique credit note number"""
    today = datetime.now().strftime("%Y%m%d")
    last_return = db.query(SaleReturn).filter(
        SaleReturn.tenant_id == tenant_id,
        SaleReturn.return_no.like(f"CN{today}%")
    ).order_by(SaleReturn.id.desc()).first()

    if last_return:
        last_seq = int(last_return.return_no[-4:])
        return f"CN{today}{last_seq + 1:04d}"
    return f"CN{today}0001"


def returned_totals(db: Session, sale_id: int) -> Dict[int, Dict[str, Decimal]]:
    """Quantity and amounts already returned per sale line"""
    columns = [func.coalesce(func.sum(getattr(SaleReturnItem, f)), 0) for f in ("quantity",) + AMOUNT_FIELDS]
    rows = db.query(SaleReturnItem.sale_item_id, *columns).join(SaleReturn).filter(
        SaleReturn.sale_id == sale_id
    ).group_by(SaleReturnItem.sale_item_id).all()
    return {
        row[0]: {f: Decimal(v) for f, v in zip(("quantity",) + AMOUNT_FIELDS, row[1:])}
        for row in rows
    }


def get_sale_or_404(db: Session, tenant_id: int, sale_id: int, lock: bool = False) -> Sale:
    query = db.query(Sale).filter(Sale.id == sale_id, Sale.tenant_id == tenant_id)
    sale = (query.with_for_update() if lock else query).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


def return_block(sale: Sale, context: TenantContext, days: int):
    """(status_code, message) when the current user cannot return items on this sale"""
    if sale.status == "cancelled":
        return 400, "Sale has been voided"
    if sale.status == "refunded":
        return 400, "All items on this sale have already been returned"
    if days > RETURN_WINDOW_DAYS and not context.is_admin:
        return 403, f"Return window of {RETURN_WINDOW_DAYS} days has passed; ask an admin to process this return"
    return None


def void_block(sale: Sale, context: TenantContext, days: int, has_returns: bool):
    """(status_code, message) when the current user cannot void this sale"""
    if sale.status == "cancelled":
        return 400, "Sale is already voided"
    if has_returns:
        return 400, "Sale has returns; process a return instead of voiding"
    if not context.is_admin:
        if sale.created_by != context.user_id:
            return 403, "Cashiers can only void their own sales"
        if days != 0:
            return 403, "Cashiers can only void same-day sales; ask an admin"
    return None


def build_return_responses(db: Session, returns: List[SaleReturn]) -> List[SaleReturnResponse]:
    user_ids = {r.created_by for r in returns if r.created_by}
    names = dict(db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()) if user_ids else {}
    responses = []
    for ret in returns:
        response = SaleReturnResponse.model_validate(ret)
        response.created_by_name = names.get(ret.created_by)
        if ret.sale:
            response.sale_no = ret.sale.sale_no
            response.customer_name = ret.sale.customer_name
            response.customer_phone = ret.sale.customer_phone
            response.invoice_no = ret.sale.invoice.invoice_no if ret.sale.invoice else None
        responses.append(response)
    return responses


def restock(db: Session, context: TenantContext, product: Product, quantity: Decimal,
            reference_type: str, reference_id: int, remarks: str) -> None:
    product.stock_quantity = (product.stock_quantity or 0) + quantity
    db.add(StockMovement(
        tenant_id=context.tenant_id,
        product_id=product.id,
        movement_type="return_in",
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        remarks=remarks,
        created_by=context.user_id
    ))


def lock_products(db: Session, tenant_id: int, product_ids) -> Dict[int, Product]:
    if not product_ids:
        return {}
    products = db.query(Product).filter(
        Product.tenant_id == tenant_id, Product.id.in_(set(product_ids))
    ).order_by(Product.id).with_for_update().all()
    return {p.id: p for p in products}


def split_tax(tax: Decimal, is_interstate: bool):
    """(cgst, sgst, igst) for a tax amount"""
    if is_interstate:
        return Decimal("0"), Decimal("0"), tax
    cgst = (tax / 2).quantize(CENTS)
    return cgst, tax - cgst, Decimal("0")


@router.get("", response_model=SaleReturnListResponse)
async def list_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List returns (credit notes) for current tenant
    """
    query = db.query(SaleReturn).options(
        joinedload(SaleReturn.items), joinedload(SaleReturn.sale).joinedload(Sale.invoice)
    ).filter(SaleReturn.tenant_id == context.tenant_id)

    if from_date:
        query = query.filter(func.date(SaleReturn.return_date + IST_OFFSET) >= from_date)
    if to_date:
        query = query.filter(func.date(SaleReturn.return_date + IST_OFFSET) <= to_date)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(Sale, SaleReturn.sale_id == Sale.id).outerjoin(
            Invoice, Invoice.sale_id == Sale.id
        ).filter(or_(
            SaleReturn.return_no.ilike(term), Sale.sale_no.ilike(term),
            Invoice.invoice_no.ilike(term), Sale.customer_phone.ilike(term)
        ))

    total = query.count()
    returns = query.order_by(SaleReturn.return_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return SaleReturnListResponse(
        items=build_return_responses(db, returns),
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{return_id}", response_model=SaleReturnResponse)
async def get_return(
    return_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get return (credit note) by ID
    """
    sale_return = db.query(SaleReturn).options(joinedload(SaleReturn.items)).filter(
        SaleReturn.id == return_id,
        SaleReturn.tenant_id == context.tenant_id
    ).first()
    if not sale_return:
        raise HTTPException(status_code=404, detail="Return not found")
    return build_return_responses(db, [sale_return])[0]


@sales_router.get("/{sale_id}/returnable", response_model=ReturnableSale)
async def get_returnable(
    sale_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Quantities still returnable on a sale and whether the current user may return or void it
    """
    sale = get_sale_or_404(db, context.tenant_id, sale_id)
    days = days_since_sale(sale)
    already = returned_totals(db, sale.id)
    loose = dict(db.query(Product.id, Product.is_loose).filter(
        Product.id.in_([i.product_id for i in sale.items])
    ).all()) if sale.items else {}

    items = []
    for item in sale.items:
        returned_qty = already.get(item.id, {}).get("quantity", Decimal("0"))
        items.append(ReturnableItem(
            sale_item_id=item.id,
            product_id=item.product_id,
            product_name=item.product_name,
            unit_type=item.unit_type,
            is_loose=bool(loose.get(item.product_id)),
            unit_price=item.unit_price,
            line_total=item.line_total,
            sold_quantity=item.quantity,
            returned_quantity=returned_qty,
            returnable_quantity=max(item.quantity - returned_qty, Decimal("0"))
        ))

    r_block = return_block(sale, context, days)
    v_block = void_block(sale, context, days, bool(sale.returns))
    return ReturnableSale(
        sale_id=sale.id,
        sale_no=sale.sale_no,
        sale_date=sale.sale_date,
        invoice_no=sale.invoice.invoice_no if sale.invoice else None,
        status=sale.status,
        payment_mode=sale.payment_mode,
        total_amount=sale.total_amount,
        returned_amount=sum((r.total_amount or Decimal("0") for r in sale.returns), Decimal("0")),
        days_since_sale=days,
        return_window_days=RETURN_WINDOW_DAYS,
        within_window=days <= RETURN_WINDOW_DAYS,
        can_return=r_block is None,
        return_block_reason=r_block[1] if r_block else None,
        can_void=v_block is None,
        void_block_reason=v_block[1] if v_block else None,
        void_reason=sale.void_reason,
        voided_at=sale.voided_at,
        items=items,
        returns=build_return_responses(db, list(sale.returns))
    )


@sales_router.post("/{sale_id}/returns", response_model=SaleReturnResponse,
                   status_code=status.HTTP_201_CREATED)
async def create_return(
    sale_id: int,
    return_data: SaleReturnCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Return some or all items of a sale (credit note).
    Cashiers: within RETURN_WINDOW_DAYS of the sale. Admins: any time.
    """
    sale = get_sale_or_404(db, context.tenant_id, sale_id, lock=True)
    days = days_since_sale(sale)
    block = return_block(sale, context, days)
    if block:
        raise HTTPException(status_code=block[0], detail=block[1])

    items_by_id = {i.id: i for i in sale.items}
    requested_ids = [i.sale_item_id for i in return_data.items]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(status_code=400, detail="Each sale line can appear only once in a return")
    missing = [i for i in requested_ids if i not in items_by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Sale line {missing[0]} does not belong to this sale")

    already = returned_totals(db, sale.id)
    products = lock_products(db, context.tenant_id, [items_by_id[i].product_id for i in requested_ids])

    sale_return = SaleReturn(
        tenant_id=context.tenant_id,
        sale_id=sale.id,
        return_no=generate_return_no(db, context.tenant_id),
        return_date=datetime.utcnow(),
        refund_mode=return_data.refund_mode or (
            sale.payment_mode if sale.payment_mode in ("cash", "card", "upi") else "cash"
        ),
        reason=return_data.reason,
        window_override=days > RETURN_WINDOW_DAYS,
        created_by=context.user_id
    )
    db.add(sale_return)
    db.flush()

    zero = Decimal("0")
    totals = {f: zero for f in ("subtotal",) + AMOUNT_FIELDS}
    return_items = []
    for item_data in return_data.items:
        sale_item = items_by_id[item_data.sale_item_id]
        product = products.get(sale_item.product_id)
        prev = already.get(sale_item.id, {})
        remaining = sale_item.quantity - prev.get("quantity", zero)
        qty = item_data.quantity

        if qty > remaining:
            raise HTTPException(
                status_code=400,
                detail=f"Only {remaining.normalize():f} of {sale_item.product_name} can be returned"
            )
        if product and not product.is_loose and qty != qty.to_integral_value():
            raise HTTPException(
                status_code=400,
                detail=f"{sale_item.product_name} is a packed item; quantity must be a whole number"
            )

        if qty == remaining:
            # Final return of this line refunds whatever is left, so rounding never drifts
            line_total = (sale_item.line_total or zero) - prev.get("line_total", zero)
            tax = (sale_item.tax_amount or zero) - prev.get("tax_amount", zero)
            discount = (sale_item.discount_amount or zero) - prev.get("discount_amount", zero)
        else:
            ratio = qty / sale_item.quantity
            line_total = ((sale_item.line_total or zero) * ratio).quantize(CENTS)
            tax = ((sale_item.tax_amount or zero) * ratio).quantize(CENTS)
            discount = ((sale_item.discount_amount or zero) * ratio).quantize(CENTS)
        cgst, sgst, igst = split_tax(tax, bool(sale.is_interstate))
        taxable = line_total - tax

        return_item = SaleReturnItem(
            return_id=sale_return.id,
            sale_item_id=sale_item.id,
            product_id=sale_item.product_id,
            product_name=sale_item.product_name,
            unit_type=sale_item.unit_type,
            quantity=qty,
            unit_price=sale_item.unit_price,
            taxable_value=taxable,
            tax_percent=sale_item.tax_percent or zero,
            tax_amount=tax,
            cgst_amount=cgst,
            sgst_amount=sgst,
            igst_amount=igst,
            discount_amount=discount,
            line_total=line_total,
            restock=item_data.restock
        )
        db.add(return_item)
        return_items.append(return_item)

        totals["subtotal"] += taxable + discount
        for field, value in (("taxable_value", taxable), ("tax_amount", tax), ("cgst_amount", cgst),
                             ("sgst_amount", sgst), ("igst_amount", igst),
                             ("discount_amount", discount), ("line_total", line_total)):
            totals[field] += value

        if item_data.restock and product:
            restock(db, context, product, qty, "sale_return", sale_return.id,
                    f"Return {sale_return.return_no} against {sale.sale_no}")

    sale_return.subtotal = totals["subtotal"]
    sale_return.tax_amount = totals["tax_amount"]
    sale_return.cgst_amount = totals["cgst_amount"]
    sale_return.sgst_amount = totals["sgst_amount"]
    sale_return.igst_amount = totals["igst_amount"]
    sale_return.discount_amount = totals["discount_amount"]
    sale_return.total_amount = totals["line_total"]

    returned_now = {i.sale_item_id: i.quantity for i in return_items}
    if all(
        already.get(i.id, {}).get("quantity", zero) + returned_now.get(i.id, zero) >= i.quantity
        for i in sale.items
    ):
        sale.status = "refunded"
    db.flush()

    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "sale_return", sale_return.id,
                 new_value={**snapshot(sale_return), "sale_no": sale.sale_no,
                            "items": [snapshot(i) for i in return_items]})
    db.commit()
    db.refresh(sale_return)

    return build_return_responses(db, [sale_return])[0]


@sales_router.post("/{sale_id}/void", response_model=SaleResponse)
async def void_sale(
    sale_id: int,
    void_data: SaleVoidRequest,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Void (cancel) a whole sale and restore its stock.
    Cashiers: only their own same-day sales. Admins: any sale without returns.
    """
    sale = get_sale_or_404(db, context.tenant_id, sale_id, lock=True)
    days = days_since_sale(sale)
    has_returns = db.query(SaleReturn.id).filter(SaleReturn.sale_id == sale.id).first() is not None
    block = void_block(sale, context, days, has_returns)
    if block:
        raise HTTPException(status_code=block[0], detail=block[1])

    old_value = snapshot(sale)
    products = lock_products(db, context.tenant_id, [i.product_id for i in sale.items])
    for item in sale.items:
        product = products.get(item.product_id)
        if product:
            restock(db, context, product, item.quantity, "sale_void", sale.id,
                    f"Void of sale {sale.sale_no}")

    sale.status = "cancelled"
    sale.voided_at = datetime.utcnow()
    sale.voided_by = context.user_id
    sale.void_reason = void_data.reason
    db.flush()

    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "sale", sale.id, old_value=old_value, new_value=snapshot(sale))
    db.commit()
    db.refresh(sale)

    return to_sale_response(sale)
