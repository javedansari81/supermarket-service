"""
Near-expiry (clearance) discounts. Packed batches get a % off by days left to expiry,
from the most specific rule (product, then category, then store default). Loose items
get the admin's daily markdown. Clearance tiers apply only once switched on for the store.
"""
from datetime import datetime, date, time, timedelta, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.clearance_rule import ClearanceRule
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.models.tenant_setting import TenantSetting

IST = timezone(timedelta(hours=5, minutes=30))
CLEARANCE_ENABLED_KEY = "clearance_enabled"
SOURCE_MANUAL = "manual"
SOURCE_CLEARANCE = "clearance"


def today_ist() -> date:
    return datetime.now(IST).date()


def end_of_today_utc() -> datetime:
    """End of the IST calendar day as a naive UTC datetime (how markdown_until is stored)"""
    end = datetime.combine(today_ist() + timedelta(days=1), time.min, tzinfo=IST)
    return end.astimezone(timezone.utc).replace(tzinfo=None)


def clearance_enabled(db: Session, tenant_id: int) -> bool:
    setting = db.query(TenantSetting).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == CLEARANCE_ENABLED_KEY
    ).first()
    return bool(setting and (setting.setting_value or "").lower() == "true")


def tier_percent(tiers: List[dict], days_left: Optional[int]) -> Decimal:
    """Highest % among tiers the batch qualifies for; nothing without expiry or once expired"""
    if days_left is None or days_left < 0:
        return Decimal("0")
    eligible = [Decimal(str(t["percent"])) for t in tiers or [] if days_left <= int(t["days_left"])]
    return max(eligible, default=Decimal("0"))


class ClearanceResolver:
    """Loads a store's rules once and gives the clearance % for products and batches"""

    def __init__(self, db: Session, tenant_id: int):
        self.enabled = clearance_enabled(db, tenant_id)
        self.today = today_ist()
        self.default_tiers = ClearanceRule.DEFAULT_TIERS
        self.by_category = {}
        self.by_product = {}
        if not self.enabled:
            return
        for rule in db.query(ClearanceRule).filter(ClearanceRule.tenant_id == tenant_id).all():
            if rule.product_id:
                self.by_product[rule.product_id] = rule.tiers
            elif rule.category_id:
                self.by_category[rule.category_id] = rule.tiers
            else:
                self.default_tiers = rule.tiers

    def tiers_for(self, product: Product) -> List[dict]:
        if product.id in self.by_product:
            return self.by_product[product.id]
        if product.category_id in self.by_category:
            return self.by_category[product.category_id]
        return self.default_tiers

    def days_left(self, expiry_date: Optional[date]) -> Optional[int]:
        return (expiry_date - self.today).days if expiry_date else None

    def percent(self, product: Product, batch: Optional[ProductBatch] = None) -> Decimal:
        """Clearance % for a batch of a packed product, or a loose product's markdown"""
        if batch is None:
            return Decimal(product.active_markdown_percent or 0)
        if not self.enabled:
            return Decimal("0")
        return tier_percent(self.tiers_for(product), self.days_left(batch.expiry_date))


def line_discount(manual: Decimal, clearance: Decimal):
    """(percent, source) for a sale line: the higher discount wins, no stacking"""
    if clearance > manual:
        return clearance, SOURCE_CLEARANCE
    if manual > 0:
        return manual, SOURCE_MANUAL
    return Decimal("0"), None
