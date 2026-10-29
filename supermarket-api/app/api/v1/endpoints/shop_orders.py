"""
Online orders for logged-in customers (home delivery only): delivery addresses (one set for
all stores), checkout quote, placing orders and order history. Prices come from the catalogue
pricing (what billing would charge); stock held by open orders is not offered again.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_FLOOR
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload
from app.core.audit import record_audit, snapshot
from app.core.database import get_db
from app.core.offers import CENTS
from app.core.online_orders import delivery_charge_for, delivery_settings, generate_order_no
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.customer_auth import CustomerAccount
from app.models.order import CustomerAddress, Order, OrderItem
from app.models.product import Product
from app.models.tenant import Tenant
from app.schemas.order import (
    AddressIn, AddressResponse, AddressListResponse, QuoteRequest, QuoteResponse, QuoteLine,
    QuoteProblem, OrderCreate, OrderSummary, OrderResponse, OrderListResponse, OrderCancel,
)
from app.api.deps import get_current_account, get_shop_tenant
from app.api.v1.endpoints.settings import build_store_settings
from app.api.v1.endpoints.shop import price_products, sellable_products

router = APIRouter()

MAX_ADDRESSES = 10
ZERO = Decimal("0")


# ---------- Delivery addresses ----------

def _get_address(db: Session, account: CustomerAccount, address_id: int) -> CustomerAddress:
    address = db.query(CustomerAddress).filter(CustomerAddress.id == address_id,
                                               CustomerAddress.account_id == account.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    return address


def _make_default(db: Session, address: CustomerAddress) -> None:
    db.query(CustomerAddress).filter(CustomerAddress.account_id == address.account_id,
                                     CustomerAddress.id != address.id
                                     ).update({CustomerAddress.is_default: False},
                                              synchronize_session=False)
    address.is_default = True


@router.get("/addresses", response_model=AddressListResponse)
async def list_addresses(db: Session = Depends(get_db),
                         account: CustomerAccount = Depends(get_current_account)):
    """The customer's delivery addresses, default first"""
    rows = db.query(CustomerAddress).filter(CustomerAddress.account_id == account.id).order_by(
        CustomerAddress.is_default.desc(), CustomerAddress.updated_at.desc()).all()
    return AddressListResponse(items=rows)


@router.post("/addresses", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
async def add_address(data: AddressIn, db: Session = Depends(get_db),
                      account: CustomerAccount = Depends(get_current_account)):
    """Save a delivery address; the first one becomes the default"""
    count = db.query(CustomerAddress).filter(CustomerAddress.account_id == account.id).count()
    if count >= MAX_ADDRESSES:
        raise HTTPException(status_code=400, detail=f"You can save up to {MAX_ADDRESSES} addresses")
    address = CustomerAddress(account_id=account.id, **data.model_dump(exclude={"is_default"}))
    db.add(address)
    db.flush()
    if data.is_default or count == 0:
        _make_default(db, address)
    db.commit()
    db.refresh(address)
    return address


@router.put("/addresses/{address_id}", response_model=AddressResponse)
async def update_address(address_id: int, data: AddressIn, db: Session = Depends(get_db),
                         account: CustomerAccount = Depends(get_current_account)):
    """Change an address (orders already placed keep the address they were sent to)"""
    address = _get_address(db, account, address_id)
    for key, value in data.model_dump(exclude={"is_default"}).items():
        setattr(address, key, value)
    if data.is_default:
        _make_default(db, address)
    db.commit()
    db.refresh(address)
    return address


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: int, db: Session = Depends(get_db),
                         account: CustomerAccount = Depends(get_current_account)):
    """Remove an address; the latest other address becomes the default"""
    address = _get_address(db, account, address_id)
    was_default = address.is_default
    db.delete(address)
    db.flush()
    if was_default:
        latest = db.query(CustomerAddress).filter(CustomerAddress.account_id == account.id
                                                  ).order_by(CustomerAddress.updated_at.desc()).first()
        if latest:
            latest.is_default = True
    db.commit()
    return {"message": "Address removed"}


# ---------- Checkout quote ----------

@dataclass
class PricedCart:
    lines: List[QuoteLine] = field(default_factory=list)
    problems: List[QuoteProblem] = field(default_factory=list)
    mrp_total: Decimal = ZERO
    items_total: Decimal = ZERO
    delivery_charge: Decimal = ZERO

    @property
    def discount_amount(self) -> Decimal:
        return max(self.mrp_total - self.items_total, ZERO)

    @property
    def total_amount(self) -> Decimal:
        return self.items_total + self.delivery_charge


def _price_cart(db: Session, tenant_id: int, items, lock: bool = False) -> PricedCart:
    """Cart lines at today's prices, with lines that are no longer sold or short of stock.
    lock = hold the products until commit so two orders cannot take the same stock."""
    ids = [i.product_id for i in items]
    if lock:
        db.query(Product.id).filter(Product.tenant_id == tenant_id, Product.id.in_(ids)
                                    ).order_by(Product.id).with_for_update().all()
    products = sellable_products(db, tenant_id).options(joinedload(Product.category)).filter(
        Product.id.in_(ids)).all()
    priced = {p["id"]: p for p in price_products(db, tenant_id, products)}
    cart = PricedCart()
    for item in items:
        p = priced.get(item.product_id)
        if p is None:
            cart.problems.append(QuoteProblem(product_id=item.product_id, reason="unavailable"))
            continue
        if not p["is_loose"] and item.quantity != item.quantity.to_integral_value():
            raise HTTPException(status_code=400,
                                detail=f"{p['product_name']} is sold in packs; use a whole number")
        if item.quantity > p["available"]:
            step = Decimal("1") if not p["is_loose"] else Decimal("0.001")
            cart.problems.append(QuoteProblem(
                product_id=p["id"], product_name=p["product_name"], reason="short",
                available=p["available"].quantize(step, rounding=ROUND_FLOOR)))
            continue
        line_total = (p["offer_price"] * item.quantity).quantize(CENTS)
        cart.mrp_total += (Decimal(p["mrp"] or p["price"]) * item.quantity).quantize(CENTS)
        cart.items_total += line_total
        cart.lines.append(QuoteLine(
            product_id=p["id"], product_name=p["product_name"], is_loose=p["is_loose"],
            unit_type=p["unit_type"], quantity=item.quantity, mrp=p["mrp"], unit_price=p["price"],
            offer_price=p["offer_price"], discount_source=p["discount_source"],
            offer_name=p["offer_name"], line_total=line_total))
    if cart.lines:
        cart.delivery_charge = delivery_charge_for(db, tenant_id, cart.items_total)
    return cart


@router.post("/stores/{store}/checkout/quote", response_model=QuoteResponse)
async def quote(data: QuoteRequest, db: Session = Depends(get_db),
                tenant: Tenant = Depends(get_shop_tenant)):
    """Bill for a cart before ordering (no login needed); nothing is saved"""
    cart = _price_cart(db, tenant.id, data.items)
    return QuoteResponse(
        items=cart.lines, problems=cart.problems, mrp_total=cart.mrp_total,
        discount_amount=cart.discount_amount, items_total=cart.items_total,
        delivery_charge=cart.delivery_charge, total_amount=cart.total_amount,
        free_delivery_min=delivery_settings(db, tenant.id)[1],
    )


# ---------- Orders ----------

def _store_customer(db: Session, tenant_id: int, account: CustomerAccount) -> Customer:
    """The store's record for this customer, created at the first order"""
    query = db.query(Customer).filter(Customer.tenant_id == tenant_id,
                                      Customer.mobile == account.mobile)
    customer = query.first()
    if customer is None:
        try:
            with db.begin_nested():
                customer = Customer(tenant_id=tenant_id, mobile=account.mobile,
                                    customer_name=account.customer_name)
                db.add(customer)
        except IntegrityError:
            customer = query.one()
    if customer.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Online ordering at this store is not available for your "
                                   "account. Please contact the store.")
    return customer


def _summary(db: Session, order: Order, store_names: Dict[int, str]) -> dict:
    if order.tenant_id not in store_names:
        store_names[order.tenant_id] = build_store_settings(db, order.tenant_id).store_name
    return dict(
        id=order.id, order_no=order.order_no, store=order.tenant.subdomain or "",
        store_name=store_names[order.tenant_id], status=order.status,
        payment_method=order.payment_method, payment_status=order.payment_status,
        item_count=len(order.items), created_at=order.created_at, mrp_total=order.mrp_total,
        discount_amount=order.discount_amount, items_total=order.items_total,
        delivery_charge=order.delivery_charge, total_amount=order.total_amount,
    )


def _order_response(db: Session, order: Order) -> OrderResponse:
    return OrderResponse(
        **_summary(db, order, {}), items=[QuoteLine.model_validate(i) for i in order.items],
        delivery_name=order.delivery_name, delivery_mobile=order.delivery_mobile,
        delivery_address=order.delivery_address, notes=order.notes,
        cancel_reason=order.cancel_reason, cancelled_by=order.cancelled_by,
        can_cancel=order.status in Order.CUSTOMER_CANCELLABLE,
    )


def _my_order(db: Session, account: CustomerAccount, order_id: int, lock: bool = False) -> Order:
    query = db.query(Order).filter(Order.id == order_id, Order.account_id == account.id)
    if lock:
        query = query.with_for_update()
    order = query.first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/stores/{store}/orders", response_model=OrderResponse,
             status_code=status.HTTP_201_CREATED)
async def place_order(data: OrderCreate, request: Request, db: Session = Depends(get_db),
                      tenant: Tenant = Depends(get_shop_tenant),
                      account: CustomerAccount = Depends(get_current_account)):
    """Place a home-delivery order. The cart is priced again and its stock held for the order;
    nothing is placed if an item is short or the total differs from what the customer saw."""
    if data.payment_method == Order.PAYMENT_ONLINE:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Online payment is not available yet. "
                                   "Please choose cash on delivery.")
    address = _get_address(db, account, data.address_id)
    customer = _store_customer(db, tenant.id, account)
    cart = _price_cart(db, tenant.id, data.items, lock=True)
    if cart.problems:
        raise HTTPException(status_code=409, detail="Some items in your cart have changed. "
                                                    "Please review your cart.")
    if cart.total_amount != data.expected_total.quantize(CENTS):
        raise HTTPException(status_code=409, detail="Prices have changed. Please review your "
                                                    "order before placing it.")

    order = Order(
        tenant_id=tenant.id, order_no=generate_order_no(db, tenant.id), account_id=account.id,
        customer_id=customer.id, payment_method=data.payment_method,
        delivery_name=address.contact_name, delivery_mobile=address.contact_mobile,
        delivery_address=address.full_address(), delivery_pincode=address.pincode,
        mrp_total=cart.mrp_total, discount_amount=cart.discount_amount,
        items_total=cart.items_total, delivery_charge=cart.delivery_charge,
        total_amount=cart.total_amount, notes=(data.notes or "").strip() or None,
        items=[OrderItem(**line.model_dump()) for line in cart.lines],
    )
    db.add(order)
    db.flush()
    record_audit(db, request, tenant.id, None, AuditLog.ACTION_CREATE, "order", order.id,
                 new_value={**snapshot(order), "items": [snapshot(i) for i in order.items]})
    db.commit()
    db.refresh(order)
    return _order_response(db, order)


@router.get("/orders", response_model=OrderListResponse)
async def list_orders(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
                      store: Optional[str] = None, db: Session = Depends(get_db),
                      account: CustomerAccount = Depends(get_current_account)):
    """The customer's orders at every store (or one store), newest first"""
    query = db.query(Order).filter(Order.account_id == account.id)
    if store:
        query = query.join(Tenant, Tenant.id == Order.tenant_id).filter(
            Tenant.subdomain == store.strip().lower())
    total = query.count()
    orders = query.options(joinedload(Order.tenant), selectinload(Order.items)).order_by(
        Order.created_at.desc(), Order.id.desc()
    ).offset((page - 1) * page_size).limit(page_size).all()
    names: Dict[int, str] = {}
    return OrderListResponse(items=[OrderSummary(**_summary(db, o, names)) for o in orders],
                             total=total, page=page, page_size=page_size)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: Session = Depends(get_db),
                    account: CustomerAccount = Depends(get_current_account)):
    """One of the customer's orders"""
    return _order_response(db, _my_order(db, account, order_id))


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(order_id: int, data: OrderCancel, request: Request,
                       db: Session = Depends(get_db),
                       account: CustomerAccount = Depends(get_current_account)):
    """Cancel an order before it is packed; its stock is offered again"""
    order = _my_order(db, account, order_id, lock=True)
    if order.status not in Order.CUSTOMER_CANCELLABLE:
        raise HTTPException(status_code=400, detail="This order can no longer be cancelled. "
                                                    "Please contact the store.")
    old_status = order.status
    order.status = Order.STATUS_CANCELLED
    order.cancelled_by = "customer"
    order.cancel_reason = (data.reason or "").strip() or None
    record_audit(db, request, order.tenant_id, None, AuditLog.ACTION_UPDATE, "order", order.id,
                 old_value={"status": old_status},
                 new_value={"status": order.status, "cancelled_by": "customer",
                            "cancel_reason": order.cancel_reason})
    db.commit()
    db.refresh(order)
    return _order_response(db, order)
