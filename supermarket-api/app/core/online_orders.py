"""
Online orders: stock held by open orders, delivery charge, order numbers and the
new-order signal the staff app listens to
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, Iterable, List
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.offers import CENTS
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.tenant_setting import TenantSetting

DELIVERY_CHARGE_KEY = "delivery_charge"
FREE_DELIVERY_MIN_KEY = "free_delivery_min"
DELIVERY_PINCODES_KEY = "delivery_pincodes"
DEFAULT_DELIVERY_CHARGE = Decimal("30")
DEFAULT_FREE_DELIVERY_MIN = Decimal("300")

# Delivery charge is billed as a line of this store product: SAC 996813 (local delivery
# services), GST 18%. Kept inactive so it is never sold at the counter or online.
DELIVERY_PRODUCT_NO = "DELIVERY"
DELIVERY_PRODUCT_NAME = "Delivery charge (online order)"
DELIVERY_SAC = "996813"
DELIVERY_GST_PERCENT = Decimal("18")

HELD_QUANTITY = func.coalesce(OrderItem.packed_quantity, OrderItem.quantity)


def reserved_quantities(db: Session, tenant_id: int, product_ids: Iterable[int]) -> Dict[int, Decimal]:
    """Quantity of each product held by the store's open orders (the packed quantity once packed)"""
    ids = list(product_ids)
    if not ids:
        return {}
    rows = db.query(OrderItem.product_id, func.sum(HELD_QUANTITY)).join(Order).filter(
        Order.tenant_id == tenant_id, Order.status.in_(Order.OPEN_STATUSES),
        OrderItem.product_id.in_(ids)
    ).group_by(OrderItem.product_id).all()
    return {product_id: Decimal(total) for product_id, total in rows}


def _decimal_setting(values: Dict[str, str], key: str, default: Decimal) -> Decimal:
    try:
        return Decimal(values[key]).quantize(CENTS)
    except (KeyError, ArithmeticError, ValueError):
        return default


def delivery_settings(db: Session, tenant_id: int):
    """(delivery charge, items total for free delivery) for the store"""
    values = dict(db.query(TenantSetting.setting_key, TenantSetting.setting_value).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key.in_([DELIVERY_CHARGE_KEY, FREE_DELIVERY_MIN_KEY])
    ).all())
    return (_decimal_setting(values, DELIVERY_CHARGE_KEY, DEFAULT_DELIVERY_CHARGE),
            _decimal_setting(values, FREE_DELIVERY_MIN_KEY, DEFAULT_FREE_DELIVERY_MIN))


def parse_pincodes(value: str) -> List[str]:
    """Valid 6-digit pincodes from a comma / space separated list, in order, without repeats"""
    seen: List[str] = []
    for part in (value or "").replace(",", " ").split():
        if len(part) == 6 and part.isdigit() and part[0] != "0" and part not in seen:
            seen.append(part)
    return seen


def delivery_pincodes(db: Session, tenant_id: int) -> List[str]:
    """Pincodes the store delivers to; empty = not delivering yet"""
    value = db.query(TenantSetting.setting_value).filter(
        TenantSetting.tenant_id == tenant_id, TenantSetting.setting_key == DELIVERY_PINCODES_KEY
    ).scalar()
    return parse_pincodes(value or "")


def delivery_charge_for(db: Session, tenant_id: int, items_total: Decimal) -> Decimal:
    charge, free_min = delivery_settings(db, tenant_id)
    return Decimal("0") if items_total >= free_min else charge


def generate_order_no(db: Session, tenant_id: int) -> str:
    """ON + date + 4-digit number for the day, per store"""
    today = datetime.now().strftime("%Y%m%d")
    last = db.query(Order.order_no).filter(
        Order.tenant_id == tenant_id, Order.order_no.like(f"ON{today}%")
    ).order_by(Order.id.desc()).first()
    seq = int(last.order_no[-4:]) + 1 if last else 1
    return f"ON{today}{seq:04d}"


def delivery_product(db: Session, tenant_id: int) -> Product:
    """The store's delivery charge product, created the first time it is billed"""
    product = db.query(Product).filter(Product.tenant_id == tenant_id,
                                       Product.product_no == DELIVERY_PRODUCT_NO).first()
    if product is None:
        product = Product(tenant_id=tenant_id, product_no=DELIVERY_PRODUCT_NO,
                          product_name=DELIVERY_PRODUCT_NAME, item_name=DELIVERY_PRODUCT_NAME,
                          name_is_custom=True, hsn_code=DELIVERY_SAC, gst_overridden=True,
                          tax_percent=DELIVERY_GST_PERCENT, unit_type="pcs", is_loose=False,
                          product_type=Product.TYPE_OWN_PACKED, stock_quantity=0, status="inactive",
                          description="Billed on delivered online orders; not for sale")
        db.add(product)
        db.flush()
    return product


def new_order_signal(db: Session, tenant_id: int) -> dict:
    """Latest order id and number of orders waiting to be confirmed, for staff alerts"""
    latest_id, waiting = db.query(
        func.max(Order.id),
        func.count(Order.id).filter(Order.status == Order.STATUS_PLACED),
    ).filter(Order.tenant_id == tenant_id).one()
    return {"latest_id": latest_id or 0, "waiting": waiting or 0}
