"""
Festival / promotional offer endpoints (admin only)
"""
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.clearance import today_ist
from app.core.offers import unit_saving
from app.models.audit_log import AuditLog
from app.models.offer import Offer, OfferItem
from app.models.product import Product
from app.schemas.offer import OfferIn, OfferItemResponse, OfferResponse, OfferListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter(dependencies=[Depends(get_current_admin_user)])


def offer_status(offer: Offer) -> str:
    today = today_ist()
    if not offer.is_active:
        return "inactive"
    if offer.end_date < today:
        return "ended"
    return "upcoming" if offer.start_date > today else "running"


def to_item_response(item: OfferItem) -> OfferItemResponse:
    product = item.product
    price = product.selling_price or product.mrp
    offer_price = (Decimal(price) - unit_saving(item, Decimal(price))).quantize(Decimal("0.01")) \
        if price is not None else None
    return OfferItemResponse(
        product_id=item.product_id, product_name=product.product_name, unit_type=product.unit_type,
        is_loose=bool(product.is_loose), discount_type=item.discount_type,
        discount_value=item.discount_value, selling_price=price,
        purchase_price=product.purchase_price, offer_price=offer_price,
        below_cost=bool(offer_price is not None and product.purchase_price
                        and offer_price < product.purchase_price),
    )


def to_offer_response(offer: Offer, with_items: bool = True) -> OfferResponse:
    return OfferResponse(
        id=offer.id, name=offer.name, start_date=offer.start_date, end_date=offer.end_date,
        is_active=offer.is_active, status=offer_status(offer), item_count=len(offer.items),
        items=[to_item_response(i) for i in offer.items] if with_items else [],
    )


def offer_snapshot(offer: Offer) -> dict:
    return {**snapshot(offer), "items": [snapshot(i, exclude=("id", "offer_id", "created_at"))
                                         for i in offer.items]}


def get_offer(db: Session, tenant_id: int, offer_id: int) -> Offer:
    offer = db.query(Offer).options(joinedload(Offer.items).joinedload(OfferItem.product)).filter(
        Offer.id == offer_id, Offer.tenant_id == tenant_id
    ).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


def apply_data(db: Session, context: TenantContext, offer: Offer, data: OfferIn) -> None:
    product_ids = {i.product_id for i in data.items}
    found = {pid for (pid,) in db.query(Product.id).filter(
        Product.tenant_id == context.tenant_id, Product.id.in_(product_ids)
    )}
    if found != product_ids:
        raise HTTPException(status_code=404, detail="Product not found")
    offer.name = data.name
    offer.start_date = data.start_date
    offer.end_date = data.end_date
    offer.is_active = data.is_active
    offer.updated_by = context.user_id
    offer.items.clear()
    db.flush()
    offer.items = [OfferItem(product_id=i.product_id, discount_type=i.discount_type,
                             discount_value=i.discount_value) for i in data.items]


@router.get("", response_model=OfferListResponse)
async def list_offers(
    status_filter: Optional[str] = Query(None, alias="status",
                                         pattern="^(running|upcoming|ended|inactive)$"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Offers, latest start first, without their products"""
    offers = db.query(Offer).options(joinedload(Offer.items)).filter(
        Offer.tenant_id == context.tenant_id
    ).order_by(Offer.start_date.desc(), Offer.id.desc()).all()
    items = [to_offer_response(o, with_items=False) for o in offers]
    return OfferListResponse(
        items=[o for o in items if not status_filter or o.status == status_filter]
    )


@router.get("/{offer_id}", response_model=OfferResponse)
async def read_offer(offer_id: int, db: Session = Depends(get_db),
                     context: TenantContext = Depends(get_tenant_context)):
    return to_offer_response(get_offer(db, context.tenant_id, offer_id))


@router.post("", response_model=OfferResponse, status_code=status.HTTP_201_CREATED)
async def create_offer(data: OfferIn, request: Request, db: Session = Depends(get_db),
                       context: TenantContext = Depends(get_tenant_context)):
    offer = Offer(tenant_id=context.tenant_id, created_by=context.user_id)
    apply_data(db, context, offer, data)
    db.add(offer)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "offer", offer.id, new_value=offer_snapshot(offer))
    db.commit()
    return to_offer_response(get_offer(db, context.tenant_id, offer.id))


@router.put("/{offer_id}", response_model=OfferResponse)
async def update_offer(offer_id: int, data: OfferIn, request: Request,
                       db: Session = Depends(get_db),
                       context: TenantContext = Depends(get_tenant_context)):
    offer = get_offer(db, context.tenant_id, offer_id)
    old_value = offer_snapshot(offer)
    apply_data(db, context, offer, data)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "offer", offer.id, old_value=old_value, new_value=offer_snapshot(offer))
    db.commit()
    db.expire_all()
    return to_offer_response(get_offer(db, context.tenant_id, offer.id))


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(offer_id: int, request: Request, db: Session = Depends(get_db),
                       context: TenantContext = Depends(get_tenant_context)):
    """Bills already made keep the offer name on their lines"""
    offer = get_offer(db, context.tenant_id, offer_id)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "offer", offer.id, old_value=offer_snapshot(offer))
    db.delete(offer)
    db.commit()
