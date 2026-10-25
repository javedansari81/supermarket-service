"""
Cashier shift (cash drawer reconciliation) endpoints.
Anyone can open a shift, add cash in and close it; only supervisors and admins can take cash
out, see the X report of an open shift (the count is blind) and approve a closing difference.
"""
from typing import Optional, List, Dict
from datetime import datetime, date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.shifts import (DENOMINATIONS, ZERO, cash_summary, counted_total, get_open_shift,
                             shift_required, variance_limit)
from app.models.audit_log import AuditLog
from app.models.cashier_shift import CashierShift, ShiftCashMovement
from app.models.sale import Sale, SalePayment
from app.models.sale_return import SaleReturn
from app.models.user import User
from app.schemas.cashier_shift import (
    ShiftOpen, CashMovementCreate, ShiftClose, ShiftApprove, ShiftResponse, CurrentShiftResponse,
    ShiftListResponse, ShiftMovementResponse, ShiftCash, DenominationRow, ShiftModeRow,
    ShiftCashierRow, ShiftReport
)
from app.api.deps import get_current_supervisor_user, get_tenant_context, TenantContext
from app.api.v1.endpoints.reports import IST, PAYMENT_MODES, POINTS_MODE, ist_day_start_utc

router = APIRouter()


def user_names(db: Session, ids) -> Dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u.full_name or u.username
            for u in db.query(User.id, User.full_name, User.username).filter(User.id.in_(ids))}


def bill_counts(db: Session, shift_ids: List[int]) -> Dict[int, int]:
    if not shift_ids:
        return {}
    return dict(db.query(Sale.shift_id, func.count(Sale.id)).filter(
        Sale.shift_id.in_(shift_ids)).group_by(Sale.shift_id).all())


def to_shift_response(shift: CashierShift, names: Dict[int, str], bills: int = 0) -> ShiftResponse:
    response = ShiftResponse.model_validate(shift)
    response.opened_by_name = names.get(shift.opened_by)
    response.closed_by_name = names.get(shift.closed_by)
    response.approved_by_name = names.get(shift.approved_by)
    response.bill_count = bills
    return response


def shift_names(db: Session, shift: CashierShift) -> Dict[int, str]:
    return user_names(db, [shift.opened_by, shift.closed_by, shift.approved_by]
                      + [m.created_by for m in shift.movements])


def get_shift_or_404(db: Session, tenant_id: int, shift_id: int, lock: bool = False) -> CashierShift:
    query = db.query(CashierShift).filter(CashierShift.id == shift_id, CashierShift.tenant_id == tenant_id)
    shift = (query.with_for_update() if lock else query).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


def require_open(shift: CashierShift) -> None:
    if shift.status != CashierShift.STATUS_OPEN:
        raise HTTPException(status_code=400, detail="Shift is already closed")


def generate_shift_no(db: Session, tenant_id: int) -> str:
    """SH<IST date>-<n>, n counting the shifts opened that day"""
    prefix = f"SH{datetime.now(IST):%Y%m%d}-"
    numbers = db.query(CashierShift.shift_no).filter(
        CashierShift.tenant_id == tenant_id, CashierShift.shift_no.like(f"{prefix}%")
    ).all()
    return f"{prefix}{max((int(n[0][len(prefix):]) for n in numbers), default=0) + 1}"


def mode_rows(db: Session, shift: CashierShift) -> List[ShiftModeRow]:
    def paid(condition):
        return dict(db.query(SalePayment.mode, func.sum(SalePayment.amount)).join(
            Sale, Sale.id == SalePayment.sale_id).filter(condition).group_by(SalePayment.mode).all())

    collected = paid(Sale.shift_id == shift.id)
    voided = paid(Sale.void_shift_id == shift.id)
    refunded: Dict[str, Decimal] = {}
    for mode, money, points in db.query(
        SaleReturn.refund_mode,
        func.sum(SaleReturn.total_amount - SaleReturn.points_refund_amount),
        func.sum(SaleReturn.points_refund_amount)
    ).filter(SaleReturn.shift_id == shift.id).group_by(SaleReturn.refund_mode).all():
        refunded[POINTS_MODE] = refunded.get(POINTS_MODE, ZERO) + Decimal(points or 0)
        refunded[mode] = refunded.get(mode, ZERO) + Decimal(money or 0)
    rows = []
    for mode in PAYMENT_MODES:
        c, r, v = (Decimal(d.get(mode) or 0) for d in (collected, refunded, voided))
        if c or r or v:
            rows.append(ShiftModeRow(mode=mode, collected=c, refunded=r, voided=v, net=c - r - v))
    return rows


def cashier_rows(db: Session, shift: CashierShift) -> List[ShiftCashierRow]:
    rows = db.query(Sale.created_by, func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0)).filter(
        Sale.shift_id == shift.id, Sale.status != "cancelled"
    ).group_by(Sale.created_by).all()
    names = user_names(db, [r[0] for r in rows])
    return sorted((ShiftCashierRow(user_id=uid, name=names.get(uid, "Unknown"), bills=count,
                                   amount=Decimal(amount)) for uid, count, amount in rows),
                  key=lambda r: -r.amount)


def to_movement_response(movement: ShiftCashMovement, names: Dict[int, str]) -> ShiftMovementResponse:
    response = ShiftMovementResponse.model_validate(movement)
    response.created_by_name = names.get(movement.created_by)
    return response


def build_report(db: Session, shift: CashierShift) -> ShiftReport:
    names = shift_names(db, shift)
    base = to_shift_response(shift, names, bill_counts(db, [shift.id]).get(shift.id, 0))
    summary = cash_summary(db, shift)
    counts = {int(v): int(c) for v, c in (shift.denominations or {}).items()}
    return ShiftReport(
        **base.model_dump(),
        report_type="X" if shift.status == CashierShift.STATUS_OPEN else "Z",
        cash=ShiftCash(**vars(summary), expected_cash=summary.expected_cash),
        denominations=[DenominationRow(value=v, count=counts[v], amount=Decimal(v * counts[v]))
                       for v in DENOMINATIONS if counts.get(v)],
        modes=mode_rows(db, shift),
        cashiers=cashier_rows(db, shift),
        movements=[to_movement_response(m, names) for m in shift.movements],
        void_count=db.query(func.count(Sale.id)).filter(Sale.void_shift_id == shift.id).scalar(),
        return_count=db.query(func.count(SaleReturn.id)).filter(SaleReturn.shift_id == shift.id).scalar(),
        variance_limit=variance_limit(db, shift.tenant_id),
    )


@router.get("/current", response_model=CurrentShiftResponse)
async def current_shift(db: Session = Depends(get_db), context: TenantContext = Depends(get_tenant_context)):
    """The open shift (without expected cash) and whether billing needs one"""
    shift = get_open_shift(db, context.tenant_id)
    return CurrentShiftResponse(
        shift=to_shift_response(shift, shift_names(db, shift), bill_counts(db, [shift.id]).get(shift.id, 0))
        if shift else None,
        shift_required=shift_required(db, context.tenant_id),
    )


@router.get("", response_model=ShiftListResponse, dependencies=[Depends(get_current_supervisor_user)])
async def list_shifts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    approval_status: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Shifts by opening time (IST days), newest first (supervisors and admins)"""
    query = db.query(CashierShift).filter(CashierShift.tenant_id == context.tenant_id)
    if from_date:
        query = query.filter(CashierShift.opened_at >= ist_day_start_utc(from_date))
    if to_date:
        query = query.filter(CashierShift.opened_at < ist_day_start_utc(to_date + timedelta(days=1)))
    if approval_status:
        query = query.filter(CashierShift.approval_status == approval_status)
    total = query.count()
    shifts = query.order_by(CashierShift.opened_at.desc(), CashierShift.id.desc()).offset(
        (page - 1) * page_size).limit(page_size).all()
    names = user_names(db, [i for s in shifts for i in (s.opened_by, s.closed_by, s.approved_by)])
    bills = bill_counts(db, [s.id for s in shifts])
    return ShiftListResponse(items=[to_shift_response(s, names, bills.get(s.id, 0)) for s in shifts],
                             total=total, page=page, page_size=page_size)


@router.post("/open", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def open_shift(data: ShiftOpen, request: Request, db: Session = Depends(get_db),
                     context: TenantContext = Depends(get_tenant_context)):
    """Open the cash drawer shift with the change money already in the drawer"""
    if get_open_shift(db, context.tenant_id):
        raise HTTPException(status_code=400, detail="A shift is already open; close it first")
    shift = CashierShift(tenant_id=context.tenant_id, shift_no=generate_shift_no(db, context.tenant_id),
                         status=CashierShift.STATUS_OPEN, opening_float=data.opening_float,
                         opened_by=context.user_id, opened_at=datetime.utcnow())
    db.add(shift)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A shift is already open; close it first")
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "cashier_shift", shift.id, new_value=snapshot(shift))
    db.commit()
    db.refresh(shift)
    return to_shift_response(shift, shift_names(db, shift))


@router.post("/{shift_id}/cash-movements", response_model=ShiftMovementResponse,
             status_code=status.HTTP_201_CREATED)
async def add_cash_movement(shift_id: int, data: CashMovementCreate, request: Request,
                            db: Session = Depends(get_db),
                            context: TenantContext = Depends(get_tenant_context)):
    """Cash in (anyone) or cash out (supervisors and admins) of the open shift's drawer"""
    out = data.movement_type == ShiftCashMovement.TYPE_OUT
    if out and not (context.is_admin or context.is_supervisor):
        raise HTTPException(status_code=403, detail="Only supervisors and admins can take cash out")
    shift = get_shift_or_404(db, context.tenant_id, shift_id, lock=True)
    require_open(shift)
    if out:
        available = cash_summary(db, shift).expected_cash
        if data.amount > available:
            raise HTTPException(status_code=400,
                                detail=f"Only ₹{available:.2f} cash is expected in the drawer")
    movement = ShiftCashMovement(tenant_id=context.tenant_id, shift_id=shift.id,
                                 movement_type=data.movement_type, amount=data.amount,
                                 reason=data.reason, created_by=context.user_id)
    db.add(movement)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "shift_cash_movement", movement.id, new_value={**snapshot(movement), "shift_no": shift.shift_no})
    db.commit()
    db.refresh(movement)
    return to_movement_response(movement, user_names(db, [movement.created_by]))


@router.get("/{shift_id}/report", response_model=ShiftReport)
async def shift_report(shift_id: int, db: Session = Depends(get_db),
                       context: TenantContext = Depends(get_tenant_context)):
    """X report of the open shift (supervisors and admins) or Z report of a closed shift"""
    shift = get_shift_or_404(db, context.tenant_id, shift_id)
    if shift.status == CashierShift.STATUS_OPEN and not (context.is_admin or context.is_supervisor):
        raise HTTPException(status_code=403,
                            detail="Expected cash is shown after the shift is closed; ask a supervisor")
    return build_report(db, shift)


@router.post("/{shift_id}/close", response_model=ShiftReport)
async def close_shift(shift_id: int, data: ShiftClose, request: Request, db: Session = Depends(get_db),
                      context: TenantContext = Depends(get_tenant_context)):
    """Close the shift with the note-by-note count; the difference from expected cash is
    worked out here, and one above the store limit waits for supervisor approval"""
    shift = get_shift_or_404(db, context.tenant_id, shift_id, lock=True)
    require_open(shift)
    old_value = snapshot(shift)
    shift.denominations = {str(v): c for v, c in sorted(data.denominations.items(), reverse=True) if c}
    shift.counted_cash = counted_total(data.denominations)
    shift.expected_cash = cash_summary(db, shift).expected_cash
    shift.difference = shift.counted_cash - shift.expected_cash
    shift.status = CashierShift.STATUS_CLOSED
    shift.closed_by = context.user_id
    shift.closed_at = datetime.utcnow()
    shift.close_note = data.note
    if abs(shift.difference) > variance_limit(db, context.tenant_id):
        shift.approval_status = CashierShift.APPROVAL_PENDING
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "cashier_shift", shift.id, old_value=old_value, new_value=snapshot(shift))
    db.commit()
    db.refresh(shift)
    return build_report(db, shift)


@router.post("/{shift_id}/approve", response_model=ShiftResponse,
             dependencies=[Depends(get_current_supervisor_user)])
async def approve_shift(shift_id: int, data: ShiftApprove, request: Request, db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    """Accept a closing difference above the limit, with the reason (supervisors and admins)"""
    shift = get_shift_or_404(db, context.tenant_id, shift_id, lock=True)
    if shift.approval_status != CashierShift.APPROVAL_PENDING:
        raise HTTPException(status_code=400, detail="This shift has no difference waiting for approval")
    old_value = snapshot(shift)
    shift.approval_status = CashierShift.APPROVAL_APPROVED
    shift.approved_by = context.user_id
    shift.approved_at = datetime.utcnow()
    shift.approval_note = data.note
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "cashier_shift", shift.id, old_value=old_value, new_value=snapshot(shift))
    db.commit()
    db.refresh(shift)
    return to_shift_response(shift, shift_names(db, shift), bill_counts(db, [shift.id]).get(shift.id, 0))
