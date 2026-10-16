"""
Coupon codes entered at checkout. A 'percent' coupon gives that % off each line (its total
optionally capped by max_discount); an 'amount' coupon's rupees are split across the lines
by value. On each line the coupon and the line's own discount (near-expiry or offer) are
compared and the higher wins, no stacking. A coupon never takes a line below its purchase
cost, and gives nothing on a line whose purchase cost is unknown.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.clearance import today_ist
from app.models.coupon import Coupon
from app.models.sale import Sale

SOURCE_COUPON = "coupon"
CENTS = Decimal("0.01")
ZERO = Decimal("0")


def normalize_code(code: Optional[str]) -> Optional[str]:
    return (code or "").strip().upper() or None


@dataclass
class CouponLine:
    gross: Decimal
    quantity: Decimal
    # Rupees off from the line's own discount (near-expiry or offer)
    existing: Decimal
    unit_cost: Optional[Decimal]
    # Rupees off from the coupon where it wins; 0 where the line's own discount stays
    amount: Decimal = ZERO


@dataclass
class CouponResult:
    # Rupees off from the coupon on the lines it won
    discount: Decimal = ZERO
    # Extra saving over the lines' own discounts
    saving: Decimal = ZERO
    floored: int = 0
    no_cost: int = 0
    notes: List[str] = field(default_factory=list)


def find_coupon(db: Session, tenant_id: int, code: str, lock: bool = False) -> Coupon:
    query = db.query(Coupon).filter(Coupon.tenant_id == tenant_id,
                                    func.upper(Coupon.code) == normalize_code(code))
    coupon = (query.with_for_update() if lock else query).first()
    if not coupon:
        raise HTTPException(status_code=400, detail=f"Coupon {normalize_code(code)} not found")
    return coupon


def times_used(db: Session, coupon: Coupon, customer_phone: Optional[str] = None) -> int:
    """Bills the coupon was used on, not counting voided bills"""
    query = db.query(func.count(Sale.id)).filter(Sale.coupon_id == coupon.id,
                                                 Sale.status != "cancelled")
    if customer_phone:
        query = query.filter(Sale.customer_phone == customer_phone)
    return query.scalar() or 0


def check_coupon(db: Session, coupon: Coupon, customer_phone: Optional[str],
                 bill_amount: Decimal) -> None:
    """Raises 400 when the coupon can't be used on this bill"""
    today = today_ist()
    if not coupon.is_active:
        raise HTTPException(status_code=400, detail=f"Coupon {coupon.code} is switched off")
    if coupon.start_date > today:
        raise HTTPException(status_code=400,
                            detail=f"Coupon {coupon.code} is valid from {coupon.start_date:%d %b %Y}")
    if coupon.end_date < today:
        raise HTTPException(status_code=400, detail=f"Coupon {coupon.code} has expired")
    if coupon.usage_limit and times_used(db, coupon) >= coupon.usage_limit:
        raise HTTPException(status_code=400, detail=f"Coupon {coupon.code} has been fully used")
    if coupon.per_customer_limit:
        if not customer_phone:
            raise HTTPException(status_code=400,
                                detail=f"Customer mobile is required for coupon {coupon.code}")
        if times_used(db, coupon, customer_phone) >= coupon.per_customer_limit:
            raise HTTPException(status_code=400,
                                detail=f"This customer has already used coupon {coupon.code}")
    minimum = Decimal(coupon.min_bill_amount or 0)
    if bill_amount < minimum:
        raise HTTPException(status_code=400,
                            detail=f"Coupon {coupon.code} needs a bill of at least \u20b9{minimum:.2f}")


def split_by_value(total: Decimal, lines: List[CouponLine]) -> List[Decimal]:
    """Rupees split in proportion to line value; rounding goes to the last line with value"""
    bill = sum((l.gross for l in lines), ZERO)
    if bill <= 0:
        return [ZERO] * len(lines)
    total = min(total, bill)
    shares = [(total * l.gross / bill).quantize(CENTS) for l in lines]
    last = max(i for i, l in enumerate(lines) if l.gross > 0)
    shares[last] += total - sum(shares, ZERO)
    return shares


def allocate_coupon(coupon: Coupon, lines: List[CouponLine]) -> CouponResult:
    """Sets each line's coupon amount (0 where its own discount is higher) and totals it"""
    result = CouponResult()
    value = Decimal(coupon.discount_value)
    if coupon.discount_type == Coupon.TYPE_PERCENT:
        raw = [(l.gross * value / 100).quantize(CENTS) for l in lines]
    else:
        raw = split_by_value(value, lines)

    offers = []
    for line, amount in zip(lines, raw):
        if line.unit_cost is None:
            if amount > line.existing:
                result.no_cost += 1
            amount = ZERO
        else:
            room = max(ZERO, line.gross - (Decimal(line.unit_cost) * line.quantity).quantize(CENTS))
            if amount > room:
                if amount > line.existing:
                    result.floored += 1
                amount = room
        offers.append(amount)

    winners = [i for i, l in enumerate(lines) if offers[i] > l.existing]
    cap = Decimal(coupon.max_discount) if coupon.discount_type == Coupon.TYPE_PERCENT \
        and coupon.max_discount else None
    if cap is not None:
        # Scale the coupon down to the cap; lines it no longer beats keep their own discount
        while winners and sum((offers[i] for i in winners), ZERO) > cap:
            total = sum((offers[i] for i in winners), ZERO)
            scaled = {i: (offers[i] * cap / total).quantize(CENTS) for i in winners}
            kept = [i for i in winners if scaled[i] > lines[i].existing]
            if kept == winners:
                scaled[winners[-1]] = min(offers[winners[-1]],
                                          scaled[winners[-1]] + cap - sum(scaled.values(), ZERO))
                for i in winners:
                    offers[i] = scaled[i]
                break
            winners = kept

    for i in winners:
        lines[i].amount = offers[i]
        result.discount += offers[i]
        result.saving += offers[i] - lines[i].existing
    if result.floored:
        result.notes.append(f"Coupon limited on {result.floored} item(s) by purchase cost")
    if result.no_cost:
        result.notes.append(f"Coupon not applied on {result.no_cost} item(s) without a purchase cost")
    return result
