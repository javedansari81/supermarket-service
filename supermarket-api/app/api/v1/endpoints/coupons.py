"""
Coupon code endpoints (admin only)
"""
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.clearance import today_ist
from app.models.audit_log import AuditLog
from app.models.coupon import Coupon
from app.models.sale import Sale
from app.schemas.coupon import CouponIn, CouponResponse, CouponListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def coupon_status(coupon: Coupon) -> str:
    today = today_ist()
    if not coupon.is_active:
        return "inactive"
    if coupon.end_date < today:
        return "ended"
    return "upcoming" if coupon.start_date > today else "running"


def usage_counts(db: Session, tenant_id: int) -> Dict[int, int]:
    """Bills each coupon was used on, not counting voided bills"""
    rows = db.query(Sale.coupon_id, func.count(Sale.id)).filter(
        Sale.tenant_id == tenant_id, Sale.coupon_id.isnot(None), Sale.status != "cancelled"
    ).group_by(Sale.coupon_id).all()
    return dict(rows)


def to_coupon_response(coupon: Coupon, used: int = 0) -> CouponResponse:
    return CouponResponse(
        id=coupon.id, code=coupon.code, description=coupon.description,
        discount_type=coupon.discount_type, discount_value=coupon.discount_value,
        max_discount=coupon.max_discount, min_bill_amount=coupon.min_bill_amount,
        start_date=coupon.start_date, end_date=coupon.end_date, is_active=coupon.is_active,
        usage_limit=coupon.usage_limit, per_customer_limit=coupon.per_customer_limit,
        status=coupon_status(coupon), times_used=used,
    )


def get_coupon(db: Session, tenant_id: int, coupon_id: int) -> Coupon:
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id, Coupon.tenant_id == tenant_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return coupon


def apply_data(db: Session, context: TenantContext, coupon: Coupon, data: CouponIn) -> None:
    duplicate = db.query(Coupon.id).filter(
        Coupon.tenant_id == context.tenant_id, func.upper(Coupon.code) == data.code,
        Coupon.id != (coupon.id or 0)
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Coupon {data.code} already exists")
    for key, value in data.model_dump().items():
        setattr(coupon, key, value)
    coupon.updated_by = context.user_id


@router.get("", response_model=CouponListResponse)
async def list_coupons(
    status_filter: Optional[str] = Query(None, alias="status",
                                         pattern="^(running|upcoming|ended|inactive)$"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Coupons, latest start first"""
    coupons = db.query(Coupon).filter(Coupon.tenant_id == context.tenant_id).order_by(
        Coupon.start_date.desc(), Coupon.id.desc()).all()
    used = usage_counts(db, context.tenant_id)
    items = [to_coupon_response(c, used.get(c.id, 0)) for c in coupons]
    return CouponListResponse(
        items=[c for c in items if not status_filter or c.status == status_filter]
    )


@router.get("/{coupon_id}", response_model=CouponResponse)
async def read_coupon(coupon_id: int, db: Session = Depends(get_db),
                      context: TenantContext = Depends(get_tenant_context)):
    coupon = get_coupon(db, context.tenant_id, coupon_id)
    return to_coupon_response(coupon, usage_counts(db, context.tenant_id).get(coupon.id, 0))


@router.post("", response_model=CouponResponse, status_code=status.HTTP_201_CREATED)
async def create_coupon(data: CouponIn, request: Request, db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    coupon = Coupon(tenant_id=context.tenant_id, created_by=context.user_id)
    apply_data(db, context, coupon, data)
    db.add(coupon)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "coupon", coupon.id, new_value=snapshot(coupon))
    db.commit()
    db.refresh(coupon)
    return to_coupon_response(coupon)


@router.put("/{coupon_id}", response_model=CouponResponse)
async def update_coupon(coupon_id: int, data: CouponIn, request: Request,
                        db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    coupon = get_coupon(db, context.tenant_id, coupon_id)
    old_value = snapshot(coupon)
    apply_data(db, context, coupon, data)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "coupon", coupon.id, old_value=old_value, new_value=snapshot(coupon))
    db.commit()
    db.refresh(coupon)
    return to_coupon_response(coupon, usage_counts(db, context.tenant_id).get(coupon.id, 0))


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coupon(coupon_id: int, request: Request, db: Session = Depends(get_db),
                        context: TenantContext = Depends(get_tenant_context)):
    """Bills already made keep the coupon code"""
    coupon = get_coupon(db, context.tenant_id, coupon_id)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "coupon", coupon.id, old_value=snapshot(coupon))
    db.query(Sale).filter(Sale.coupon_id == coupon.id).update(
        {Sale.coupon_id: None}, synchronize_session=False)
    db.delete(coupon)
    db.commit()
