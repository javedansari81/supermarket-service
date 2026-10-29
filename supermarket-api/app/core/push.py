"""
Order updates to customers by browser notification (Web Push).

The customer turns updates on in the shop; the browser gives a push address on its maker's
push service (Google, Mozilla, Apple, Microsoft), saved as a CustomerPushSubscription. When
staff move an order on, the message is sent after the staff reply (a background task), so a
slow push service never delays the store. Addresses the push service reports as gone are
removed. Make the VAPID keys once with `python -m app.core.push`.
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from urllib.parse import urlparse

import requests
from fastapi import BackgroundTasks
from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.customer_auth import CustomerPushSubscription
from app.models.order import Order

logger = logging.getLogger("app.push")

# Order steps the customer is told about; placing and the customer's own cancel are not
NOTIFY_STATUSES = (Order.STATUS_CONFIRMED, Order.STATUS_OUT_FOR_DELIVERY,
                   Order.STATUS_DELIVERED, Order.STATUS_CANCELLED)
# Push services of the browsers; messages are only ever sent to these hosts
PUSH_HOSTS = ("fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com",
              "notify.windows.com")
GONE = (404, 410)


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def is_push_service(endpoint: str) -> bool:
    url = urlparse(endpoint)
    host = (url.hostname or "").lower()
    return url.scheme == "https" and any(host == h or host.endswith(f".{h}") for h in PUSH_HOSTS)


def _rupees(amount) -> str:
    value = Decimal(amount)
    return f"{value:.0f}" if value == value.to_integral_value() else f"{value:.2f}"


def wants_update(order: Order) -> bool:
    """True when the order's new status is one the customer is told about"""
    if not push_enabled() or order.status not in NOTIFY_STATUSES:
        return False
    return order.status != Order.STATUS_CANCELLED or order.cancelled_by == "store"


def order_message(order: Order, store_name: str) -> Optional[dict]:
    """Notification title and text for the order's status, or None when nothing is sent"""
    if order.status not in NOTIFY_STATUSES:
        return None
    no = order.order_no
    if order.status == Order.STATUS_CONFIRMED:
        title = "Order confirmed"
        body = f"{store_name} has confirmed your order {no}. We will tell you when it is on the way."
    elif order.status == Order.STATUS_OUT_FOR_DELIVERY:
        title = "Out for delivery"
        body = f"Your order {no} from {store_name} is on the way."
        if order.payment_method == Order.PAYMENT_COD and order.payment_status != "paid":
            body += f" Please keep ₹{_rupees(order.total_amount)} ready."
    elif order.status == Order.STATUS_DELIVERED:
        title = "Order delivered"
        body = f"Your order {no} has been delivered. Thank you for shopping at {store_name}!"
    elif order.cancelled_by == "store":
        title = "Order cancelled"
        body = f"{store_name} cancelled your order {no}" + (
            f": {order.cancel_reason}" if order.cancel_reason else ".")
    else:
        return None
    return {"title": title, "body": body, "url": f"/orders/{order.id}", "tag": f"order-{order.id}",
            "order_id": order.id, "status": order.status}


@dataclass(frozen=True)
class Device:
    id: int
    endpoint: str
    p256dh: str
    auth: str


def queue_order_update(db: Session, background: BackgroundTasks, order: Order,
                       store_name: str) -> None:
    """Send the order's new status to the customer's devices once the staff reply is out"""
    message = order_message(order, store_name) if push_enabled() else None
    if message is None:
        return
    devices = [Device(s.id, s.endpoint, s.p256dh, s.auth) for s in db.query(
        CustomerPushSubscription).filter(CustomerPushSubscription.account_id == order.account_id)]
    if devices:
        background.add_task(send_to_devices, devices, message)


def _send_one(device: Device, data: str) -> None:
    webpush(subscription_info={"endpoint": device.endpoint,
                               "keys": {"p256dh": device.p256dh, "auth": device.auth}},
            data=data, vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT}, timeout=settings.PUSH_TIMEOUT_SECONDS,
            ttl=settings.PUSH_TTL_SECONDS, headers={"Urgency": "high"})


def send_to_devices(devices: List[Device], message: dict) -> None:
    """Runs after the response; a failure on one device never stops the others"""
    data = json.dumps(message)
    sent: List[int] = []
    gone: List[int] = []
    for device in devices:
        try:
            _send_one(device, data)
            sent.append(device.id)
        except WebPushException as err:
            code = err.response.status_code if err.response is not None else None
            if code in GONE:
                gone.append(device.id)
            else:
                logger.warning("Push to device %s failed: HTTP %s", device.id, code)
        except (requests.RequestException, ValueError) as err:
            logger.warning("Push to device %s failed: %s", device.id, type(err).__name__)
    logger.info("Order %s '%s' update sent to %d of %d device(s), %d gone", message["order_id"],
                message["status"], len(sent), len(devices), len(gone))
    _record(sent, gone)


def _record(sent: List[int], gone: List[int]) -> None:
    if not sent and not gone:
        return
    db = SessionLocal()
    try:
        if gone:
            db.query(CustomerPushSubscription).filter(CustomerPushSubscription.id.in_(gone)
                                                      ).delete(synchronize_session=False)
        if sent:
            db.query(CustomerPushSubscription).filter(CustomerPushSubscription.id.in_(sent)).update(
                {CustomerPushSubscription.last_sent_at: datetime.utcnow()}, synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not update push devices")
    finally:
        db.close()


if __name__ == "__main__":
    # One-time VAPID key pair for .env (keep the private key secret)
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid02, b64urlencode
    vapid = Vapid02()
    vapid.generate_keys()
    public = vapid.public_key.public_bytes(serialization.Encoding.X962,
                                           serialization.PublicFormat.UncompressedPoint)
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    print(f"VAPID_PUBLIC_KEY={b64urlencode(public)}")
    print(f"VAPID_PRIVATE_KEY={b64urlencode(private)}")
