"""
Held (parked) bill endpoints
"""
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.held_bill import HeldBill
from app.schemas.held_bill import HeldBillCreate, HeldBillResponse, HeldBillListResponse
from app.api.deps import get_tenant_context, TenantContext

router = APIRouter()

MAX_HELD_BILLS_PER_USER = 10


def held_bill_query(db: Session, context: TenantContext):
    """Held bills visible to the user: cashiers see their own, supervisors and admins all"""
    query = db.query(HeldBill).options(joinedload(HeldBill.cashier)).filter(
        HeldBill.tenant_id == context.tenant_id
    )
    if not (context.is_admin or context.is_supervisor):
        query = query.filter(HeldBill.created_by == context.user_id)
    return query


def get_held_bill(db: Session, context: TenantContext, held_bill_id: int) -> HeldBill:
    held = held_bill_query(db, context).filter(HeldBill.id == held_bill_id).first()
    if not held:
        raise HTTPException(status_code=404, detail="Held bill not found")
    return held


def apply_held_data(held: HeldBill, data: HeldBillCreate) -> None:
    held.label = data.label
    held.customer_name = data.customer_name
    held.customer_phone = data.customer_phone
    held.items = jsonable_encoder([item.model_dump() for item in data.items])
    held.item_count = len(data.items)
    held.total_amount = sum((item.line_total for item in data.items), Decimal("0"))


def to_held_bill_response(held: HeldBill) -> HeldBillResponse:
    response = HeldBillResponse.model_validate(held)
    if held.cashier:
        response.cashier_name = held.cashier.full_name or held.cashier.username
    return response


@router.get("", response_model=HeldBillListResponse)
async def list_held_bills(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List held bills, oldest first
    """
    items = held_bill_query(db, context).order_by(HeldBill.created_at, HeldBill.id).all()
    return HeldBillListResponse(items=[to_held_bill_response(h) for h in items], total=len(items))


@router.get("/{held_bill_id}", response_model=HeldBillResponse)
async def get_held_bill_by_id(
    held_bill_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get a held bill to recall it into the cart
    """
    return to_held_bill_response(get_held_bill(db, context, held_bill_id))


@router.post("", response_model=HeldBillResponse, status_code=status.HTTP_201_CREATED)
async def create_held_bill(
    data: HeldBillCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Hold (park) the current cart
    """
    count = db.query(HeldBill).filter(
        HeldBill.tenant_id == context.tenant_id,
        HeldBill.created_by == context.user_id
    ).count()
    if count >= MAX_HELD_BILLS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"You already have {MAX_HELD_BILLS_PER_USER} held bills; complete or discard one first"
        )
    held = HeldBill(tenant_id=context.tenant_id, created_by=context.user_id)
    apply_held_data(held, data)
    db.add(held)
    db.commit()
    db.refresh(held)
    return to_held_bill_response(held)


@router.put("/{held_bill_id}", response_model=HeldBillResponse)
async def update_held_bill(
    held_bill_id: int,
    data: HeldBillCreate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Hold a recalled bill again with its changed cart
    """
    held = get_held_bill(db, context, held_bill_id)
    apply_held_data(held, data)
    db.commit()
    db.refresh(held)
    return to_held_bill_response(held)


@router.delete("/{held_bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_held_bill(
    held_bill_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Discard a held bill without selling it
    """
    held = get_held_bill(db, context, held_bill_id)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "held_bill", held.id, old_value=snapshot(held))
    db.delete(held)
    db.commit()
