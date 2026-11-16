"""
Repack endpoints: pack loose stock (e.g. Toor Dal Loose, 30 kg) into own-packed products
(Toor Dal 1 kg MF, 500 g MF, 250 g MF). The loose stock goes down by the packed weight plus
any wastage; each pack product gets a new batch, costed from the loose cost per unit with the
wastage cost spread over the packs.
"""
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.core.audit import record_audit
from app.core.batches import create_batch, sync_batches
from app.core.clearance import today_ist
from app.core.database import get_db, lock_sequence
from app.models.product import Product
from app.models.repack import Repack, RepackItem
from app.models.stock_movement import StockMovement
from app.models.tenant_setting import TenantSetting
from app.schemas.repack import (
    RepackCreate, RepackItemResponse, RepackListResponse, RepackPackOption,
    RepackResponse, RepackSourceResponse
)
from app.api.v1.endpoints.reports import IST_OFFSET
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()

WASTAGE_PERCENT_KEY = "repack_wastage_percent"
DEFAULT_WASTAGE_PERCENT = Decimal("0.5")
QTY = Decimal("0.001")
CENTS = Decimal("0.01")

# Unit -> (dimension, size in grams / ml)
UNIT_SIZES = {"g": ("mass", Decimal("1")), "kg": ("mass", Decimal("1000")),
              "ml": ("volume", Decimal("1")), "L": ("volume", Decimal("1000"))}


def quantity_per_pack(pack: Product, loose_unit: Optional[str]) -> Optional[Decimal]:
    """Loose quantity one pack uses, in the loose unit (500 g pack from kg stock -> 0.5);
    None when the pack size is missing or not convertible (e.g. g pack from L stock)"""
    pack_unit = UNIT_SIZES.get(pack.net_unit or "")
    source_unit = UNIT_SIZES.get(loose_unit or "")
    if not pack.net_quantity or not pack_unit or not source_unit or pack_unit[0] != source_unit[0]:
        return None
    return Decimal(pack.net_quantity) * pack_unit[1] / source_unit[1]


def wastage_percent(db: Session, tenant_id: int) -> Decimal:
    """Recommended wastage, % of the packed weight (store setting)"""
    value = db.query(TenantSetting.setting_value).filter(
        TenantSetting.tenant_id == tenant_id,
        TenantSetting.setting_key == WASTAGE_PERCENT_KEY
    ).scalar()
    try:
        percent = Decimal(value) if value not in (None, "") else DEFAULT_WASTAGE_PERCENT
    except InvalidOperation:
        percent = DEFAULT_WASTAGE_PERCENT
    return min(max(percent, Decimal("0")), Decimal("100"))


def recommended_wastage(packed: Decimal, percent: Decimal) -> Decimal:
    return (packed * percent / 100).quantize(QTY, rounding=ROUND_HALF_UP)


def get_loose_product(db: Session, tenant_id: int, product_id: int, lock: bool = False) -> Product:
    query = db.query(Product).filter(Product.id == product_id, Product.tenant_id == tenant_id)
    if lock:
        query = query.with_for_update()
    product = query.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.product_type != Product.TYPE_LOOSE:
        raise HTTPException(status_code=400, detail=f"{product.product_name} is not a loose product")
    if product.status != "active":
        raise HTTPException(status_code=400, detail=f"{product.product_name} is inactive")
    return product


def matching_packs(db: Session, loose: Product) -> List[Tuple[Product, Decimal]]:
    """Active own-packed products with the loose product's item name
    ('Toor Dal Loose' -> 'Toor Dal 1 kg MF', 'Toor Dal 500 g MF'), largest pack first"""
    item_name = (loose.item_name or "").strip().lower()
    if not item_name:
        return []
    packs = db.query(Product).filter(
        Product.tenant_id == loose.tenant_id,
        Product.status == "active",
        Product.product_type == Product.TYPE_OWN_PACKED,
        func.lower(func.trim(Product.item_name)) == item_name,
    ).all()
    options = [(p, per_pack) for p in packs
               if (per_pack := quantity_per_pack(p, loose.unit_type)) is not None]
    return sorted(options, key=lambda o: (-o[1], o[0].product_name))


def generate_repack_no(db: Session, tenant_id: int) -> str:
    """RP + date + 3-digit number for the day, per store"""
    lock_sequence(db, "repack_no", tenant_id)
    today = today_ist().strftime("%Y%m%d")
    last = db.query(Repack.repack_no).filter(
        Repack.tenant_id == tenant_id, Repack.repack_no.like(f"RP{today}%")
    ).order_by(Repack.id.desc()).first()
    seq = int(last.repack_no[-3:]) + 1 if last else 1
    return f"RP{today}{seq:03d}"


def repack_response(repack: Repack) -> RepackResponse:
    source = repack.source_product
    return RepackResponse(
        id=repack.id, repack_no=repack.repack_no, source_product_id=repack.source_product_id,
        source_product_name=source.product_name if source else None,
        unit_type=source.unit_type if source else None,
        packed_quantity=repack.packed_quantity, wastage_enabled=repack.wastage_enabled,
        wastage_quantity=repack.wastage_quantity, total_quantity=repack.total_quantity,
        source_unit_cost=repack.source_unit_cost, expiry_date=repack.expiry_date,
        remarks=repack.remarks, created_at=repack.created_at, created_by=repack.created_by,
        items=[RepackItemResponse(
            id=item.id, product_id=item.product_id,
            product_name=item.product.product_name if item.product else None,
            batch_id=item.batch_id, pack_count=item.pack_count,
            source_quantity=item.source_quantity, unit_cost=item.unit_cost
        ) for item in repack.items]
    )


def with_details():
    return (joinedload(Repack.source_product),
            joinedload(Repack.items).joinedload(RepackItem.product))


@router.get("/sources/{product_id}", response_model=RepackSourceResponse)
def get_repack_source(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user=Depends(get_current_admin_user)
):
    """Loose product, the pack products it can be packed into and the recommended wastage %"""
    loose = get_loose_product(db, context.tenant_id, product_id)
    return RepackSourceResponse(
        product_id=loose.id, product_name=loose.product_name, unit_type=loose.unit_type or "kg",
        stock_quantity=loose.stock_quantity or Decimal("0"), purchase_price=loose.purchase_price,
        wastage_percent=wastage_percent(db, context.tenant_id),
        packs=[RepackPackOption(
            product_id=p.id, product_name=p.product_name, net_quantity=p.net_quantity,
            net_unit=p.net_unit, source_quantity_per_pack=per_pack, mrp=p.mrp,
            selling_price=p.selling_price, stock_quantity=p.stock_quantity or Decimal("0")
        ) for p, per_pack in matching_packs(db, loose)]
    )


@router.post("", response_model=RepackResponse, status_code=status.HTTP_201_CREATED)
def create_repack(
    data: RepackCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user=Depends(get_current_admin_user)
):
    """Pack loose stock into own-packed products (admin only)"""
    tenant_id = context.tenant_id
    # Lock every product row in id order (same order as purchases) so concurrent stock
    # changes cannot deadlock
    ids = sorted({data.source_product_id, *(i.product_id for i in data.items)})
    locked: Dict[int, Product] = {p.id: p for p in db.query(Product).filter(
        Product.id.in_(ids), Product.tenant_id == tenant_id
    ).order_by(Product.id).with_for_update().all()}

    if data.source_product_id not in locked:
        raise HTTPException(status_code=404, detail="Product not found")
    loose = get_loose_product(db, tenant_id, data.source_product_id)

    lines: List[Tuple[Product, int, Decimal]] = []
    for item in data.items:
        pack = locked.get(item.product_id)
        if not pack or pack.id == loose.id:
            raise HTTPException(status_code=400, detail=f"Pack product {item.product_id} not found")
        if pack.product_type != Product.TYPE_OWN_PACKED or pack.status != "active":
            raise HTTPException(status_code=400,
                                detail=f"{pack.product_name} must be an active own-packed product")
        per_pack = quantity_per_pack(pack, loose.unit_type)
        if per_pack is None:
            raise HTTPException(
                status_code=400,
                detail=f"Pack size of {pack.product_name} cannot be taken from {loose.unit_type} stock"
            )
        lines.append((pack, item.pack_count, per_pack * item.pack_count))

    packed = sum((qty for _, _, qty in lines), Decimal("0"))
    if data.wastage_enabled:
        wastage = data.wastage_quantity.quantize(QTY, rounding=ROUND_HALF_UP) \
            if data.wastage_quantity is not None \
            else recommended_wastage(packed, wastage_percent(db, tenant_id))
    else:
        wastage = Decimal("0")
    total = packed + wastage
    stock = Decimal(loose.stock_quantity or 0)
    if total > stock:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough {loose.product_name}: need {total.normalize():f} {loose.unit_type} "
                   f"({packed.normalize():f} packed + {wastage.normalize():f} wastage), "
                   f"only {stock.normalize():f} in stock"
        )
    if data.expiry_date and data.expiry_date < today_ist():
        raise HTTPException(status_code=400, detail="Best before date cannot be in the past")

    # Packs carry the cost of the loose stock they used, including the wastage
    source_cost = loose.purchase_price
    cost_factor = total / packed

    repack = Repack(
        tenant_id=tenant_id, repack_no=generate_repack_no(db, tenant_id),
        source_product_id=loose.id, packed_quantity=packed, wastage_enabled=data.wastage_enabled,
        wastage_quantity=wastage, total_quantity=total, source_unit_cost=source_cost,
        expiry_date=data.expiry_date, remarks=data.remarks, created_by=context.user_id
    )
    db.add(repack)
    db.flush()

    remarks = f"Repack {repack.repack_no}" + (f": {data.remarks}" if data.remarks else "")

    def movement(product: Product, movement_type: str, quantity: Decimal, batch_id: Optional[int] = None):
        db.add(StockMovement(
            tenant_id=tenant_id, product_id=product.id, batch_id=batch_id,
            movement_type=movement_type, quantity=quantity, reference_type="repack",
            reference_id=repack.id, remarks=remarks, created_by=context.user_id
        ))

    loose.stock_quantity = stock - total
    movement(loose, "repack_out", packed)
    if wastage > 0:
        movement(loose, "wastage_out", wastage)

    for pack, count, source_qty in lines:
        unit_cost = (Decimal(source_cost) * source_qty / count * cost_factor).quantize(
            CENTS, rounding=ROUND_HALF_UP) if source_cost is not None else None
        sync_batches(db, pack)
        batch = create_batch(db, pack, mrp=pack.mrp, selling_price=pack.selling_price,
                             purchase_price=unit_cost, expiry_date=data.expiry_date,
                             batch_no=repack.repack_no)
        batch.quantity_received = Decimal(count)
        batch.quantity_left = Decimal(count)
        pack.stock_quantity = Decimal(pack.stock_quantity or 0) + count
        if unit_cost is not None:
            pack.purchase_price = unit_cost
        if data.expiry_date:
            pack.expiry_date = data.expiry_date
        db.add(RepackItem(repack_id=repack.id, product_id=pack.id, batch_id=batch.id,
                          pack_count=count, source_quantity=source_qty, unit_cost=unit_cost))
        movement(pack, "repack_in", Decimal(count), batch.id)

    db.flush()
    record_audit(db, request, tenant_id, context.user_id, "CREATE", "repack", repack.id,
                 new_value={"repack_no": repack.repack_no, "source": loose.product_name,
                            "packed": packed, "wastage": wastage,
                            "items": [{"product": p.product_name, "packs": c} for p, c, _ in lines]})
    db.commit()

    repack = db.query(Repack).options(*with_details()).filter(Repack.id == repack.id).one()
    return repack_response(repack)


@router.get("", response_model=RepackListResponse)
def list_repacks(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    source_product_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user=Depends(get_current_admin_user)
):
    """Repack history, newest first"""
    query = db.query(Repack).filter(Repack.tenant_id == context.tenant_id)
    if source_product_id:
        query = query.filter(Repack.source_product_id == source_product_id)
    if from_date:
        query = query.filter(func.date(Repack.created_at + IST_OFFSET) >= from_date)
    if to_date:
        query = query.filter(func.date(Repack.created_at + IST_OFFSET) <= to_date)
    total = query.count()
    repacks = query.options(*with_details()).order_by(Repack.id.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()
    return RepackListResponse(items=[repack_response(r) for r in repacks],
                              total=total, page=page, page_size=page_size)


@router.get("/{repack_id}", response_model=RepackResponse)
def get_repack(
    repack_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user=Depends(get_current_admin_user)
):
    repack = db.query(Repack).options(*with_details()).filter(
        Repack.id == repack_id, Repack.tenant_id == context.tenant_id
    ).first()
    if not repack:
        raise HTTPException(status_code=404, detail="Repack not found")
    return repack_response(repack)
