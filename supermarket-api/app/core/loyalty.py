"""
Customer loyalty points. Points are earned on the part of a bill paid by cash/card/upi and
redeemed as the 'points' payment mode. loyalty_transactions is the ledger; customers.points_balance
is the cached balance, changed only through post_points with the customer row locked. The whole
balance expires after expiry_days without an earn or redeem (rolling period).
"""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_FLOOR
from typing import Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.customer import Customer
from app.models.loyalty_transaction import LoyaltyTransaction
from app.models.sale import Sale
from app.models.sale_return import SaleReturn
from app.models.tenant_setting import TenantSetting
from app.schemas.settings import LoyaltySettings

POINTS_MODE = "points"
KEY_PREFIX = "loyalty_"
LOYALTY_KEYS = [KEY_PREFIX + name for name in LoyaltySettings.model_fields]


def get_loyalty_settings(db: Session, tenant_id: int) -> LoyaltySettings:
    """Stored loyalty settings, defaults for any not saved"""
    rows = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key.in_(LOYALTY_KEYS)
    ).all()
    values = {r.setting_key[len(KEY_PREFIX):]: r.setting_value for r in rows if r.setting_value}
    if "enabled" in values:
        values["enabled"] = values["enabled"].lower() == "true"
    return LoyaltySettings(**values)


def loyalty_settings_values(settings: LoyaltySettings) -> dict:
    """Settings as tenant_settings key/value strings"""
    return {KEY_PREFIX + k: (str(v).lower() if isinstance(v, bool) else str(v))
            for k, v in settings.model_dump().items()}


def lock_customer(db: Session, tenant_id: int, customer_id: int) -> Optional[Customer]:
    return db.query(Customer).filter(
        Customer.tenant_id == tenant_id, Customer.id == customer_id
    ).with_for_update().populate_existing().first()


def expires_at(customer: Customer, settings: LoyaltySettings) -> Optional[datetime]:
    if not settings.expiry_days or not customer.loyalty_last_activity:
        return None
    return customer.loyalty_last_activity + timedelta(days=settings.expiry_days)


def is_expired(customer: Customer, settings: LoyaltySettings) -> bool:
    end = expires_at(customer, settings)
    return bool(end and (customer.points_balance or 0) > 0 and datetime.utcnow() >= end)


def effective_balance(customer: Customer, settings: LoyaltySettings) -> int:
    """Balance as of now, 0 when due to expire but not yet written off"""
    return 0 if is_expired(customer, settings) else (customer.points_balance or 0)


def points_value(points: int, settings: LoyaltySettings) -> Decimal:
    return (Decimal(points) * settings.point_value).quantize(Decimal("0.01"))


def post_points(db: Session, customer: Customer, txn_type: str, points: int,
                user_id: Optional[int], sale_id: Optional[int] = None,
                return_id: Optional[int] = None, remarks: Optional[str] = None,
                touch: bool = False) -> Optional[LoyaltyTransaction]:
    """Add a ledger row and update the cached balance (customer must be locked).
    touch=True restarts the expiry period (earn and redeem)."""
    if touch:
        customer.loyalty_last_activity = datetime.utcnow()
    if not points:
        return None
    balance = (customer.points_balance or 0) + points
    if balance < 0:
        raise HTTPException(status_code=400,
                            detail=f"Customer has only {customer.points_balance} points")
    customer.points_balance = balance
    txn = LoyaltyTransaction(tenant_id=customer.tenant_id, customer_id=customer.id,
                             txn_type=txn_type, points=points, balance_after=balance,
                             sale_id=sale_id, return_id=return_id, remarks=remarks,
                             created_by=user_id)
    db.add(txn)
    return txn


def expire_if_due(db: Session, customer: Customer, settings: LoyaltySettings,
                  user_id: Optional[int]) -> None:
    """Write off the balance when the expiry period has passed (customer must be locked)"""
    if is_expired(customer, settings):
        post_points(db, customer, LoyaltyTransaction.TYPE_EXPIRE, -customer.points_balance,
                    user_id, remarks=f"No activity for {settings.expiry_days} days")


def points_to_earn(paid_amount: Decimal, settings: LoyaltySettings) -> int:
    """Whole points for the amount paid by cash/card/upi"""
    if not settings.enabled or paid_amount <= 0:
        return 0
    points = Decimal(paid_amount) * settings.earn_points_per_100 / 100
    return int(points.to_integral_value(rounding=ROUND_FLOOR))


def points_to_redeem(amount: Decimal, total: Decimal, customer: Optional[Customer],
                     settings: LoyaltySettings) -> int:
    """Checks a 'points' payment of amount Rs on a bill of total Rs; gives the points it uses"""
    if not settings.enabled:
        raise HTTPException(status_code=400, detail="Loyalty points are not enabled")
    if customer is None:
        raise HTTPException(status_code=400, detail="Paying by points needs the customer's mobile")
    points = Decimal(amount) / settings.point_value
    if points != points.to_integral_value():
        raise HTTPException(
            status_code=400,
            detail=f"Points amount must be a multiple of ₹{settings.point_value} (one point)")
    points = int(points)
    if points < settings.min_redeem_points:
        raise HTTPException(status_code=400,
                            detail=f"At least {settings.min_redeem_points} points must be redeemed")
    cap = (Decimal(total) * settings.max_redeem_percent / 100).quantize(Decimal("0.01"))
    if Decimal(amount) > cap:
        raise HTTPException(
            status_code=400,
            detail=f"Points can pay at most {settings.max_redeem_percent}% of the bill (₹{cap:.2f})")
    balance = effective_balance(customer, settings)
    if points > balance:
        raise HTTPException(status_code=400, detail=f"Customer has only {balance} points")
    return points


def reverse_for_sale(db: Session, sale: Sale, returned_total: Decimal, returned_now: Decimal,
                     user_id: Optional[int], return_id: Optional[int] = None,
                     remarks: Optional[str] = None) -> Tuple[int, Decimal, int]:
    """On a return/void, credit back the returned share of redeemed points and take back the
    returned share of earned points (capped at the balance). returned_total is the Rs returned
    so far including this return. Gives (points_refunded, points_refund_amount, points_reversed)."""
    zero = Decimal("0")
    total = Decimal(sale.total_amount or 0)
    redeemed, earned = sale.points_redeemed or 0, sale.points_earned or 0
    if not sale.customer_id or total <= 0 or not (redeemed or earned):
        return 0, zero, 0
    customer = lock_customer(db, sale.tenant_id, sale.customer_id)
    if customer is None:
        return 0, zero, 0

    full = Decimal(returned_total) >= total

    def share(points: int) -> int:
        if full:
            return points
        return int((Decimal(points) * Decimal(returned_total) / total)
                   .to_integral_value(rounding=ROUND_FLOOR))

    done = dict(db.query(LoyaltyTransaction.txn_type,
                         func.coalesce(func.sum(LoyaltyTransaction.points), 0))
                .filter(LoyaltyTransaction.sale_id == sale.id,
                        LoyaltyTransaction.txn_type.in_([LoyaltyTransaction.TYPE_REDEEM_REFUND,
                                                         LoyaltyTransaction.TYPE_EARN_REVERSAL]))
                .group_by(LoyaltyTransaction.txn_type).all())
    refunded = max(share(redeemed) - int(done.get(LoyaltyTransaction.TYPE_REDEEM_REFUND, 0)), 0)
    to_reverse = max(share(earned) + int(done.get(LoyaltyTransaction.TYPE_EARN_REVERSAL, 0)), 0)

    settings = get_loyalty_settings(db, sale.tenant_id)
    expire_if_due(db, customer, settings, user_id)

    refund_amount = zero
    if refunded:
        paid = sum((Decimal(p.amount) for p in sale.payments if p.mode == POINTS_MODE), zero)
        if full:
            already = db.query(func.coalesce(func.sum(SaleReturn.points_refund_amount), 0)).filter(
                SaleReturn.sale_id == sale.id
            ).scalar()
            refund_amount = paid - Decimal(already)
        else:
            refund_amount = (paid * refunded / redeemed).quantize(Decimal("0.01"))
        refund_amount = max(min(refund_amount, Decimal(returned_now)), zero)
        post_points(db, customer, LoyaltyTransaction.TYPE_REDEEM_REFUND, refunded, user_id,
                    sale_id=sale.id, return_id=return_id, remarks=remarks, touch=True)

    reversed_points = min(to_reverse, customer.points_balance or 0)
    post_points(db, customer, LoyaltyTransaction.TYPE_EARN_REVERSAL, -reversed_points, user_id,
                sale_id=sale.id, return_id=return_id, remarks=remarks)
    db.flush()
    return refunded, refund_amount, reversed_points
