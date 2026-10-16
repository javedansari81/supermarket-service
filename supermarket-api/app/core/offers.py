"""
Festival / promotional offers. A running offer gives a product % off or Rs off per unit
(per kg for loose items). On a sale line the offer and the near-expiry discount are
compared in rupees saved; the highest wins, no stacking.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session, joinedload
from app.core.clearance import today_ist, SOURCE_CLEARANCE
from app.models.offer import Offer, OfferItem

SOURCE_OFFER = "offer"
CENTS = Decimal("0.01")


def unit_saving(item: OfferItem, unit_price: Decimal) -> Decimal:
    """Rupees an offer takes off one unit, never more than the price"""
    if item.discount_type == OfferItem.TYPE_PERCENT:
        return unit_price * Decimal(item.discount_value) / 100
    return min(Decimal(item.discount_value), unit_price)


def offer_saving(item: OfferItem, unit_price: Decimal, quantity: Decimal, line_gross: Decimal) -> Decimal:
    """Rupees an offer takes off a sale line"""
    if item.discount_type == OfferItem.TYPE_PERCENT:
        saving = line_gross * Decimal(item.discount_value) / 100
    else:
        saving = Decimal(item.discount_value) * quantity
    return min(saving, line_gross).quantize(CENTS)


class OfferResolver:
    """Loads a store's running offers once and gives the best offer for a product"""

    def __init__(self, db: Session, tenant_id: int):
        today = today_ist()
        rows = db.query(OfferItem).join(Offer).options(joinedload(OfferItem.offer)).filter(
            Offer.tenant_id == tenant_id,
            Offer.is_active.is_(True),
            Offer.start_date <= today,
            Offer.end_date >= today,
        ).all()
        self.by_product: Dict[int, List[OfferItem]] = {}
        for row in rows:
            self.by_product.setdefault(row.product_id, []).append(row)

    def best(self, product_id: int, unit_price: Decimal) -> Optional[OfferItem]:
        """Running offer saving the most on one unit at this price; the earlier offer on a tie"""
        items = sorted(self.by_product.get(product_id, []), key=lambda i: i.offer_id)
        return max(items, key=lambda i: unit_saving(i, Decimal(unit_price or 0)), default=None)


@dataclass
class LineDiscount:
    percent: Decimal
    amount: Decimal
    source: Optional[str] = None
    offer: Optional[OfferItem] = None


def resolve_line_discount(line_gross: Decimal, quantity: Decimal, unit_price: Decimal,
                          clearance_percent: Decimal, offer: Optional[OfferItem]) -> LineDiscount:
    """The discount saving the customer the most on a line; clearance wins a tie"""
    best = LineDiscount(Decimal("0"), Decimal("0"))
    if clearance_percent > 0:
        best = LineDiscount(clearance_percent, (line_gross * clearance_percent / 100).quantize(CENTS),
                            SOURCE_CLEARANCE)
    if offer:
        amount = offer_saving(offer, unit_price, quantity, line_gross)
        if amount > best.amount:
            percent = Decimal(offer.discount_value) if offer.discount_type == OfferItem.TYPE_PERCENT \
                else (amount * 100 / line_gross).quantize(CENTS) if line_gross else Decimal("0")
            best = LineDiscount(percent, amount, SOURCE_OFFER, offer)
    return best
