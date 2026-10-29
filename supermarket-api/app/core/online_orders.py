"""
Online orders: stock held by open orders, delivery charge and order numbers
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, Iterable
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.offers import CENTS
from app.models.order import Order, OrderItem
from app.models.tenant_setting import TenantSetting

DELIVERY_CHARGE_KEY = "delivery_charge"
FREE_DELIVERY_MIN_KEY = "free_delivery_min"
DEFAULT_DELIVERY_CHARGE = Decimal("30")
DEFAULT_FREE_DELIVERY_MIN = Decimal("300")


def reserved_quantities(db: Session, tenant_id: int, product_ids: Iterable[int]) -> Dict[int, Decimal]:
    """Quantity of each product held by the store's open orders"""
    ids = list(product_ids)
    if not ids:
        return {}
    rows = db.query(OrderItem.product_id, func.sum(OrderItem.quantity)).join(Order).filter(
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
