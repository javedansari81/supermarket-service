"""
Cash drawer shifts: the store has one shared drawer, so at most one shift is open at a time.
Bills, returns and voids are recorded against the open shift; expected cash at close is
opening float + cash on bills - cash refunds - cash of voided bills + cash in - cash out.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.cashier_shift import CashierShift, ShiftCashMovement
from app.models.sale import Sale, SalePayment
from app.models.sale_return import SaleReturn
from app.models.tenant_setting import TenantSetting

CASH_MODE = "cash"
# Indian notes and coins counted at close (Rs 10 and Rs 20 include both notes and coins)
DENOMINATIONS = (500, 200, 100, 50, 20, 10, 5, 2, 1)
SHIFT_REQUIRED_KEY = "shift_required"
VARIANCE_LIMIT_KEY = "shift_variance_limit"
DEFAULT_VARIANCE_LIMIT = Decimal("100")
ZERO = Decimal("0")


def _setting(db: Session, tenant_id: int, key: str) -> Optional[str]:
    row = db.query(TenantSetting.setting_value).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == key
    ).first()
    return row[0] if row and row[0] else None


def shift_required(db: Session, tenant_id: int) -> bool:
    return (_setting(db, tenant_id, SHIFT_REQUIRED_KEY) or "false").lower() == "true"


def variance_limit(db: Session, tenant_id: int) -> Decimal:
    value = _setting(db, tenant_id, VARIANCE_LIMIT_KEY)
    try:
        return Decimal(value) if value else DEFAULT_VARIANCE_LIMIT
    except InvalidOperation:
        return DEFAULT_VARIANCE_LIMIT


def get_open_shift(db: Session, tenant_id: int, lock: Optional[str] = None) -> Optional[CashierShift]:
    """The open shift; lock='share' keeps it from closing meanwhile, 'update' locks it exclusively"""
    query = db.query(CashierShift).filter(
        CashierShift.tenant_id == tenant_id,
        CashierShift.status == CashierShift.STATUS_OPEN
    )
    if lock == "share":
        query = query.with_for_update(read=True)
    elif lock == "update":
        query = query.with_for_update()
    return query.first()


def shift_for_cash(db: Session, tenant_id: int) -> Optional[CashierShift]:
    """Open shift to record a bill, return or void against; 400 when the store requires
    a shift and none is open"""
    shift = get_open_shift(db, tenant_id, lock="share")
    if shift is None and shift_required(db, tenant_id):
        raise HTTPException(status_code=400,
                            detail="No shift is open. Open a shift before billing, returns or voids")
    return shift


@dataclass
class CashSummary:
    opening_float: Decimal
    cash_sales: Decimal
    cash_refunds: Decimal
    cash_voids: Decimal
    cash_in: Decimal
    cash_out: Decimal

    @property
    def expected_cash(self) -> Decimal:
        return (self.opening_float + self.cash_sales - self.cash_refunds - self.cash_voids
                + self.cash_in - self.cash_out)


def _cash_paid(db: Session, *conditions) -> Decimal:
    return Decimal(db.query(func.coalesce(func.sum(SalePayment.amount), 0)).join(
        Sale, Sale.id == SalePayment.sale_id
    ).filter(SalePayment.mode == CASH_MODE, *conditions).scalar())


def cash_summary(db: Session, shift: CashierShift) -> CashSummary:
    """Cash movements of the drawer during the shift"""
    refunds = db.query(
        func.coalesce(func.sum(SaleReturn.total_amount - SaleReturn.points_refund_amount), 0)
    ).filter(SaleReturn.shift_id == shift.id, SaleReturn.refund_mode == CASH_MODE).scalar()
    moved = dict(db.query(
        ShiftCashMovement.movement_type, func.sum(ShiftCashMovement.amount)
    ).filter(ShiftCashMovement.shift_id == shift.id).group_by(ShiftCashMovement.movement_type).all())
    return CashSummary(
        opening_float=Decimal(shift.opening_float or 0),
        cash_sales=_cash_paid(db, Sale.shift_id == shift.id),
        cash_refunds=Decimal(refunds),
        cash_voids=_cash_paid(db, Sale.void_shift_id == shift.id),
        cash_in=Decimal(moved.get(ShiftCashMovement.TYPE_IN) or 0),
        cash_out=Decimal(moved.get(ShiftCashMovement.TYPE_OUT) or 0),
    )


def counted_total(denominations: dict) -> Decimal:
    return sum((Decimal(int(value)) * count for value, count in denominations.items()), ZERO)
