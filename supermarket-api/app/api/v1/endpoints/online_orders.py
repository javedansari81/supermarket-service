"""
Online orders for store staff: list, confirm, pack (weighed or lower quantities), out for
delivery, delivered (billed as a sale through the billing code, cash in the open shift) and
cancel (supervisors and admins). Staff get a live signal when a new order comes in.
"""
import asyncio
import json
import time
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload
from app.core.audit import record_audit
from app.core.database import SessionLocal, get_db
from app.core.offers import CENTS, LineDiscount
from app.core.online_orders import delivery_product, new_order_signal
from app.core.shifts import shift_for_cash
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.user import User
from app.schemas.order import (
    StaffOrder, StaffOrderItem, StaffOrderSummary, StaffOrderListResponse, PackRequest,
    DeliverRequest, StoreCancel,
)
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.api.deps import (TenantContext, get_current_supervisor_user, get_current_user,
                          get_tenant_context)
from app.api.v1.endpoints.sales import PricedLine, price_lines, record_sale

router = APIRouter()

ZERO = Decimal("0")
# Loose items may weigh up to 10% more than ordered
LOOSE_OVERWEIGHT = Decimal("1.10")
SIGNAL_POLL_SECONDS = 2
SIGNAL_PING_SECONDS = 20
# The browser reconnects after this, which also refreshes the staff login check
STREAM_SECONDS = 300


def _summary(order: Order) -> dict:
    customer = order.customer
    return dict(
        id=order.id, order_no=order.order_no, status=order.status,
        payment_method=order.payment_method, payment_status=order.payment_status,
        customer_name=customer.customer_name if customer else None,
        customer_mobile=customer.mobile if customer else order.delivery_mobile,
        delivery_pincode=order.delivery_pincode, item_count=len(order.items),
        created_at=order.created_at, mrp_total=order.mrp_total,
        discount_amount=order.discount_amount, items_total=order.items_total,
        delivery_charge=order.delivery_charge, total_amount=order.total_amount,
    )


def _detail(order: Order) -> StaffOrder:
    sale = order.sale
    return StaffOrder(
        **_summary(order), items=[StaffOrderItem.model_validate(i) for i in order.items],
        delivery_name=order.delivery_name, delivery_mobile=order.delivery_mobile,
        delivery_address=order.delivery_address, notes=order.notes,
        cancel_reason=order.cancel_reason, cancelled_by=order.cancelled_by,
        confirmed_at=order.confirmed_at, packed_at=order.packed_at,
        dispatched_at=order.dispatched_at, delivered_at=order.delivered_at,
        cancelled_at=order.cancelled_at, sale_id=order.sale_id,
        sale_no=sale.sale_no if sale else None,
        invoice_no=sale.invoice.invoice_no if sale and sale.invoice else None,
    )


def _get_order(db: Session, context: TenantContext, order_id: int, lock: bool = False) -> Order:
    query = db.query(Order).filter(Order.id == order_id, Order.tenant_id == context.tenant_id)
    if lock:
        query = query.with_for_update()
    order = query.first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _require_status(order: Order, allowed, action: str) -> None:
    if order.status not in allowed:
        raise HTTPException(status_code=400,
                            detail=f"Cannot {action}: the order is {order.status.replace('_', ' ')}")


def _move(db: Session, request: Request, context: TenantContext, order: Order, status: str,
          extra: Optional[dict] = None) -> StaffOrder:
    old = order.status
    order.status = status
    order.updated_by = context.user_id
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "order", order.id, old_value={"status": old},
                 new_value={"status": status, **(extra or {})})
    db.commit()
    db.refresh(order)
    return _detail(order)


@router.get("", response_model=StaffOrderListResponse)
async def list_orders(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                      status: Optional[str] = None,
                      search: Optional[str] = Query(None, max_length=50),
                      db: Session = Depends(get_db),
                      context: TenantContext = Depends(get_tenant_context)):
    """The store's online orders, oldest open order first; search by order no. or mobile"""
    base = db.query(Order).filter(Order.tenant_id == context.tenant_id)
    counts = dict(base.with_entities(Order.status, func.count(Order.id)).group_by(Order.status).all())
    query = base
    if status:
        query = query.filter(Order.status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.outerjoin(Customer, Customer.id == Order.customer_id).filter(or_(
            Order.order_no.ilike(term), Customer.mobile.ilike(term), Order.delivery_mobile.ilike(term)))
    total = query.count()
    open_first = Order.status.in_(Order.OPEN_STATUSES)
    order_by = [Order.created_at.asc()] if status in Order.OPEN_STATUSES else [Order.created_at.desc()]
    if not status:
        order_by = [open_first.desc(), Order.created_at.desc()]
    orders = query.options(joinedload(Order.customer), selectinload(Order.items)).order_by(
        *order_by, Order.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return StaffOrderListResponse(items=[StaffOrderSummary(**_summary(o)) for o in orders],
                                  total=total, page=page, page_size=page_size, counts=counts)


def _read_signal(tenant_id: int) -> dict:
    db = SessionLocal()
    try:
        return new_order_signal(db, tenant_id)
    finally:
        db.close()


@router.get("/stream")
async def order_stream(request: Request, current_user: User = Depends(get_current_user)):
    """Server-sent events: `orders` with the latest order id and the number waiting to be
    confirmed, sent at once and whenever it changes (checked every 2 seconds)"""
    tenant_id = current_user.tenant_id

    async def events():
        last = None
        last_sent = time.monotonic()
        ends = last_sent + STREAM_SECONDS
        yield "retry: 3000\n\n"
        while time.monotonic() < ends and not await request.is_disconnected():
            signal = await run_in_threadpool(_read_signal, tenant_id)
            if signal != last:
                last = signal
                last_sent = time.monotonic()
                yield f"event: orders\ndata: {json.dumps(signal)}\n\n"
            elif time.monotonic() - last_sent > SIGNAL_PING_SECONDS:
                last_sent = time.monotonic()
                yield ": ping\n\n"
            await asyncio.sleep(SIGNAL_POLL_SECONDS)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{order_id}", response_model=StaffOrder)
async def get_order(order_id: int, db: Session = Depends(get_db),
                    context: TenantContext = Depends(get_tenant_context)):
    """One order with its items"""
    return _detail(_get_order(db, context, order_id))


@router.post("/{order_id}/confirm", response_model=StaffOrder)
async def confirm_order(order_id: int, request: Request, db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    """Accept a new order"""
    order = _get_order(db, context, order_id, lock=True)
    _require_status(order, (Order.STATUS_PLACED,), "confirm")
    order.confirmed_at = datetime.utcnow()
    return _move(db, request, context, order, Order.STATUS_CONFIRMED)


@router.post("/{order_id}/pack", response_model=StaffOrder)
async def pack_order(order_id: int, data: PackRequest, request: Request,
                     db: Session = Depends(get_db),
                     context: TenantContext = Depends(get_tenant_context)):
    """Record what was packed: the same or a lower quantity (0 = out of stock), loose items
    at their weighed quantity. The bill is worked out again at the order's prices."""
    order = _get_order(db, context, order_id, lock=True)
    _require_status(order, (Order.STATUS_CONFIRMED, Order.STATUS_PACKED), "pack")
    packed: Dict[int, Decimal] = {p.item_id: p.packed_quantity for p in data.items}
    if set(packed) != {i.id for i in order.items}:
        raise HTTPException(status_code=400, detail="Give the packed quantity of every item")
    stock = dict(db.query(Product.id, Product.stock_quantity).filter(
        Product.id.in_([i.product_id for i in order.items])).with_for_update().all())
    mrp_total = items_total = ZERO
    for item in order.items:
        qty = packed[item.id]
        limit = item.quantity * LOOSE_OVERWEIGHT if item.is_loose else item.quantity
        if qty > limit:
            raise HTTPException(status_code=400,
                                detail=f"{item.product_name}: packed more than ordered")
        if not item.is_loose and qty != qty.to_integral_value():
            raise HTTPException(status_code=400,
                                detail=f"{item.product_name}: use a whole number of packs")
        on_hand = Decimal(stock.get(item.product_id) or 0)
        if qty > on_hand:
            raise HTTPException(status_code=400, detail=f"{item.product_name}: only "
                                                        f"{on_hand.normalize():f} in stock")
        item.packed_quantity = qty
        item.line_total = (item.offer_price * qty).quantize(CENTS)
        items_total += item.line_total
        mrp_total += (Decimal(item.mrp or item.unit_price) * qty).quantize(CENTS)
    if items_total <= 0:
        raise HTTPException(status_code=400,
                            detail="Nothing can be packed; cancel the order instead")
    order.mrp_total = mrp_total
    order.items_total = items_total
    order.discount_amount = max(mrp_total - items_total, ZERO)
    order.total_amount = items_total + order.delivery_charge
    order.packed_at = datetime.utcnow()
    return _move(db, request, context, order, Order.STATUS_PACKED,
                 {"packed": {str(k): v for k, v in packed.items()},
                  "total_amount": order.total_amount})


@router.post("/{order_id}/dispatch", response_model=StaffOrder)
async def dispatch_order(order_id: int, request: Request, db: Session = Depends(get_db),
                         context: TenantContext = Depends(get_tenant_context)):
    """The order has left the store"""
    order = _get_order(db, context, order_id, lock=True)
    _require_status(order, (Order.STATUS_PACKED,), "send out")
    order.dispatched_at = datetime.utcnow()
    return _move(db, request, context, order, Order.STATUS_OUT_FOR_DELIVERY)


def _cap_to_order_prices(lines: List[PricedLine], items: List[OrderItem]) -> None:
    """The customer never pays more than the order price: when today's bill for an item is
    higher (an offer ended), the difference is given as an 'online' discount"""
    for index, item in enumerate(items):
        own = [l for l in lines if l.index == index]
        gross = sum((l.gross for l in own), ZERO)
        current = sum((l.discount.amount for l in own), ZERO)
        needed = gross - (item.offer_price * item.packed_quantity).quantize(CENTS)
        if needed <= current:
            continue
        given = ZERO
        for n, line in enumerate(own):
            amount = needed - given if n == len(own) - 1 \
                else (needed * line.gross / gross).quantize(CENTS)
            amount = min(max(amount, ZERO), line.gross)
            given += amount
            percent = (amount * 100 / line.gross).quantize(CENTS) if line.gross else ZERO
            line.discount = LineDiscount(percent, amount, line.discount.source or "online",
                                         line.discount.offer)


@router.post("/{order_id}/deliver", response_model=StaffOrder)
async def deliver_order(order_id: int, data: DeliverRequest, request: Request,
                        db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    """Handed over and paid: billed as a sale (tax invoice, loyalty points, stock taken off)
    with the payment in the open cash drawer shift"""
    order = _get_order(db, context, order_id, lock=True)
    _require_status(order, Order.DELIVERABLE, "mark delivered")
    shift = shift_for_cash(db, context.tenant_id)
    items = [i for i in order.items if i.packed_quantity and i.packed_quantity > 0]
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    remarks = f"Online order {order.order_no}"
    if data.reference and data.reference.strip():
        remarks += f" · {data.payment_mode.upper()} ref {data.reference.strip()}"
    sale_data = SaleCreate(
        items=[SaleItemCreate(product_id=i.product_id, quantity=i.packed_quantity)
               for i in items],
        payment_mode=data.payment_mode, customer_phone=customer.mobile,
        customer_name=customer.customer_name or order.delivery_name, remarks=remarks,
    )
    lines = price_lines(db, context.tenant_id, sale_data.items, any_mrp=True)
    _cap_to_order_prices(lines, items)
    if order.delivery_charge > 0:
        charge = Decimal(order.delivery_charge)
        lines.append(PricedLine(len(items), delivery_product(db, context.tenant_id), None,
                                Decimal("1"), charge, None, charge,
                                LineDiscount(ZERO, ZERO), None, stock=False))
    sale, _ = record_sale(db, request, context, sale_data, lines, shift)
    order.sale_id = sale.id
    order.payment_status = "paid"
    order.total_amount = sale.total_amount
    order.items_total = sale.total_amount - order.delivery_charge
    order.discount_amount = max(order.mrp_total - order.items_total, ZERO)
    order.delivered_at = datetime.utcnow()
    return _move(db, request, context, order, Order.STATUS_DELIVERED,
                 {"sale_no": sale.sale_no, "payment_mode": data.payment_mode,
                  "total_amount": sale.total_amount})


@router.post("/{order_id}/cancel", response_model=StaffOrder)
async def cancel_order(order_id: int, data: StoreCancel, request: Request,
                       db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_supervisor_user),
                       context: TenantContext = Depends(get_tenant_context)):
    """Cancel an open order (supervisors and admins); its stock is offered again"""
    order = _get_order(db, context, order_id, lock=True)
    _require_status(order, Order.OPEN_STATUSES, "cancel")
    order.cancelled_by = "store"
    order.cancel_reason = data.reason
    order.cancelled_at = datetime.utcnow()
    return _move(db, request, context, order, Order.STATUS_CANCELLED,
                 {"cancelled_by": "store", "cancel_reason": data.reason})
