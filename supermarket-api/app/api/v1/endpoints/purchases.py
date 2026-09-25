"""
Purchase/Procurement management endpoints
"""
import os
import uuid
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File
from sqlalchemy import func, cast, Integer
from sqlalchemy.orm import Session, joinedload, selectinload
from app.core import storage
from app.core.config import settings
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.batches import match_or_create_batch, sync_batches, uses_batches
from app.models.audit_log import AuditLog
from app.models.purchase import Purchase, PurchaseItem
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.models.supplier import Supplier
from app.models.stock_movement import StockMovement
from app.models.store_location import ProductLocation
from app.schemas.purchase import (
    PurchaseCreate, PurchaseUpdate, PurchaseCancel, PurchaseResponse, PurchaseListResponse,
    PurchaseBillUrl
)
from app.schemas.store_location import PutawayItem, ProductLocationResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_purchase_no(db: Session, tenant_id: int) -> str:
    """Generate unique purchase number (PO000001, PO000002, ...)"""
    last_seq = db.query(
        func.max(cast(func.substring(Purchase.purchase_no, 3), Integer))
    ).filter(
        Purchase.tenant_id == tenant_id,
        Purchase.purchase_no.op("~")("^PO[0-9]+$")
    ).scalar() or 0
    return f"PO{last_seq + 1:06d}"


def purchase_snapshot(purchase: Purchase) -> dict:
    """Purchase header with its line items for audit logging"""
    return {**snapshot(purchase), "items": [snapshot(item) for item in purchase.items]}


def line_prices(product: Product, item_data):
    """MRP / selling price of a purchase line, defaulting to the product's current prices"""
    mrp = item_data.mrp if item_data.mrp is not None else product.mrp
    selling_price = item_data.selling_price
    if selling_price is None:
        selling_price = product.selling_price
        if selling_price is None or (mrp is not None and selling_price > mrp):
            selling_price = mrp
    if mrp is not None and selling_price is not None and selling_price > mrp:
        raise HTTPException(status_code=400,
                            detail=f"{product.product_name}: selling price cannot be greater than MRP")
    return mrp, selling_price


def receive_line(db: Session, product: Product, item_data, purchase: Purchase,
                 candidates: Optional[List[ProductBatch]] = None) -> PurchaseItem:
    """Add a purchase line's quantity to stock. Packed items go into the batch with the same
    MRP / price / expiry (or a new one); the product keeps the latest prices."""
    mrp, selling_price = line_prices(product, item_data)
    batch = None
    if uses_batches(product):
        batch = match_or_create_batch(
            db, product, mrp=mrp, selling_price=selling_price, purchase_price=item_data.unit_cost,
            expiry_date=item_data.expiry_date, batch_no=item_data.batch_no,
            purchase_id=purchase.id, candidates=candidates
        )
        batch.quantity_received = (batch.quantity_received or 0) + item_data.quantity
        batch.quantity_left = (batch.quantity_left or 0) + item_data.quantity
    product.stock_quantity = (product.stock_quantity or 0) + item_data.quantity
    product.purchase_price = item_data.unit_cost
    product.mrp, product.selling_price = mrp, selling_price
    return PurchaseItem(
        product_id=product.id,
        quantity=item_data.quantity,
        unit_cost=item_data.unit_cost,
        total_cost=item_data.quantity * item_data.unit_cost,
        batch_id=batch.id if batch else None,
        batch_no=item_data.batch_no,
        mrp=mrp,
        selling_price=selling_price,
        expiry_date=item_data.expiry_date
    )


def lock_purchase_products(db: Session, product_ids, tenant_id: int) -> dict:
    """Lock the products and reconcile their batches with product stock"""
    products = {}
    for product_id in sorted(set(product_ids)):
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.tenant_id == tenant_id
        ).with_for_update().first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {product_id} not found")
        sync_batches(db, product)
        products[product_id] = product
    return products


def lock_item_batches(db: Session, items) -> dict:
    batch_ids = sorted({item.batch_id for item in items if item.batch_id})
    if not batch_ids:
        return {}
    return {b.id: b for b in db.query(ProductBatch).filter(
        ProductBatch.id.in_(batch_ids)
    ).order_by(ProductBatch.id).with_for_update().all()}


@router.get("", response_model=PurchaseListResponse)
async def list_purchases(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List purchases for current tenant
    """
    query = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(Purchase.tenant_id == context.tenant_id)
    
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    
    if status:
        query = query.filter(Purchase.status == status)
    
    if from_date:
        query = query.filter(Purchase.purchase_date >= from_date)
    
    if to_date:
        query = query.filter(Purchase.purchase_date <= to_date)
    
    total = query.count()
    items = query.order_by(Purchase.purchase_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    
    return PurchaseListResponse(
        items=[PurchaseResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{purchase_id}", response_model=PurchaseResponse)
async def get_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get purchase by ID
    """
    purchase = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(
        Purchase.id == purchase_id,
        Purchase.tenant_id == context.tenant_id
    ).first()
    
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    return PurchaseResponse.model_validate(purchase)


@router.get("/{purchase_id}/putaway", response_model=List[PutawayItem])
async def get_purchase_putaway(
    purchase_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Put-away list for a purchase: each product with its assigned locations, sorted by
    primary display location code so staff can place goods in one walk. Unassigned items come last.
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    product_ids = {item.product_id for item in purchase.items}
    products = {
        p.id: p for p in db.query(Product).options(
            selectinload(Product.locations).joinedload(ProductLocation.location)
        ).filter(Product.id.in_(product_ids), Product.tenant_id == context.tenant_id).all()
    } if product_ids else {}

    quantities: dict = {}
    for item in purchase.items:
        quantities[item.product_id] = quantities.get(item.product_id, Decimal("0")) + item.quantity

    def sort_key(link: ProductLocation):
        return (link.role != "display", not link.is_primary, link.location_code or "")

    rows = []
    for product_id, quantity in quantities.items():
        product = products.get(product_id)
        if not product:
            continue
        links = sorted(product.locations, key=sort_key)
        rows.append(PutawayItem(
            product_id=product.id,
            product_no=product.product_no,
            product_name=product.product_name,
            quantity=quantity,
            locations=[ProductLocationResponse.model_validate(link) for link in links]
        ))
    rows.sort(key=lambda r: (not r.locations, r.locations[0].location_code if r.locations else "",
                             r.product_name))
    return rows


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    purchase_data: PurchaseCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new purchase and update stock (admin only)
    """
    if purchase_data.supplier_id:
        supplier = db.query(Supplier).filter(
            Supplier.id == purchase_data.supplier_id,
            Supplier.tenant_id == context.tenant_id
        ).first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")
        if supplier.status != "active":
            raise HTTPException(status_code=400, detail=f"Supplier {supplier.supplier_name} is inactive")

    # Generate purchase number
    purchase_no = generate_purchase_no(db, context.tenant_id)
    
    # Calculate total amount
    total_amount = Decimal("0")
    
    # Create purchase
    purchase = Purchase(
        tenant_id=context.tenant_id,
        purchase_no=purchase_no,
        supplier_id=purchase_data.supplier_id,
        supplier_invoice_no=purchase_data.supplier_invoice_no,
        purchase_date=purchase_data.purchase_date,
        remarks=purchase_data.remarks,
        created_by=context.user_id
    )
    db.add(purchase)
    db.flush()

    products = lock_purchase_products(db, [i.product_id for i in purchase_data.items], context.tenant_id)

    # Add purchase items and update stock
    for item_data in purchase_data.items:
        purchase_item = receive_line(db, products[item_data.product_id], item_data, purchase)
        total_amount += purchase_item.total_cost
        purchase.items.append(purchase_item)

        # Create stock movement
        stock_movement = StockMovement(
            tenant_id=context.tenant_id,
            product_id=item_data.product_id,
            batch_id=purchase_item.batch_id,
            movement_type="purchase_in",
            quantity=item_data.quantity,
            reference_type="purchase",
            reference_id=purchase.id,
            created_by=context.user_id
        )
        db.add(stock_movement)
    
    purchase.total_amount = total_amount
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "purchase", purchase.id,
                 new_value={**snapshot(purchase), "items": purchase_data.model_dump()["items"]})
    db.commit()
    db.refresh(purchase)

    return PurchaseResponse.model_validate(purchase)


def get_tenant_purchase(db: Session, purchase_id: int, tenant_id: int) -> Purchase:
    purchase = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items)
    ).filter(
        Purchase.id == purchase_id,
        Purchase.tenant_id == tenant_id
    ).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


def reverse_line(product: Product, item: PurchaseItem, batch: Optional[ProductBatch]) -> None:
    """Take a purchase line's quantity back out of stock (and out of its batch)"""
    current_stock = product.stock_quantity or Decimal("0")
    available = min(current_stock, batch.quantity_left) if batch else current_stock
    if available < item.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reduce {product.product_name} by {item.quantity}: only {available} "
                   f"in stock (some may already be sold)"
        )
    product.stock_quantity = current_stock - item.quantity
    if batch:
        batch.quantity_left -= item.quantity
        batch.quantity_received = max((batch.quantity_received or 0) - item.quantity, Decimal("0"))


def replace_purchase_items(db: Session, purchase: Purchase, new_items, context: TenantContext) -> None:
    """Replace purchase lines and post stock differences per batch as adjustment movements"""
    old_items = list(purchase.items)
    products = lock_purchase_products(
        db, [i.product_id for i in old_items] + [i.product_id for i in new_items], context.tenant_id
    )
    old_batches = lock_item_batches(db, old_items)

    deltas: dict = {}
    purchase.items.clear()
    total_amount = Decimal("0")
    for item_data in new_items:
        purchase_item = receive_line(db, products[item_data.product_id], item_data, purchase,
                                     candidates=list(old_batches.values()))
        total_amount += purchase_item.total_cost
        purchase.items.append(purchase_item)
        key = (item_data.product_id, purchase_item.batch_id)
        deltas[key] = deltas.get(key, Decimal("0")) + item_data.quantity

    for item in old_items:
        reverse_line(products[item.product_id], item, old_batches.get(item.batch_id))
        key = (item.product_id, item.batch_id)
        deltas[key] = deltas.get(key, Decimal("0")) - item.quantity

    for product in products.values():
        sync_batches(db, product)

    remarks = f"Edited purchase {purchase.purchase_no}"
    for (product_id, batch_id), delta in deltas.items():
        if delta == 0:
            continue
        db.add(StockMovement(
            tenant_id=context.tenant_id,
            product_id=product_id,
            batch_id=batch_id,
            movement_type="adjustment_in" if delta > 0 else "adjustment_out",
            quantity=abs(delta),
            reference_type="purchase",
            reference_id=purchase.id,
            remarks=remarks,
            created_by=context.user_id
        ))
    purchase.total_amount = total_amount


@router.put("/{purchase_id}", response_model=PurchaseResponse)
async def update_purchase(
    purchase_id: int,
    purchase_data: PurchaseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a purchase (admin only). When items are sent they replace the existing
    lines and stock is adjusted by the difference per product.
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled purchase cannot be edited")

    update_data = purchase_data.model_dump(exclude_unset=True, exclude={"items"})
    if "purchase_date" in update_data and update_data["purchase_date"] is None:
        raise HTTPException(status_code=400, detail="Purchase date is required")

    new_supplier_id = update_data.get("supplier_id")
    if new_supplier_id and new_supplier_id != purchase.supplier_id:
        supplier = db.query(Supplier).filter(
            Supplier.id == new_supplier_id,
            Supplier.tenant_id == context.tenant_id
        ).first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")
        if supplier.status != "active":
            raise HTTPException(status_code=400, detail=f"Supplier {supplier.supplier_name} is inactive")

    old_value = purchase_snapshot(purchase)
    for field, value in update_data.items():
        setattr(purchase, field, value)

    if purchase_data.items is not None:
        replace_purchase_items(db, purchase, purchase_data.items, context)

    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "purchase", purchase.id, old_value=old_value, new_value=purchase_snapshot(purchase))
    db.commit()
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))


@router.post("/{purchase_id}/cancel", response_model=PurchaseResponse)
async def cancel_purchase(
    purchase_id: int,
    cancel_data: PurchaseCancel,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Cancel a purchase and reverse the stock it added (admin only)
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if purchase.status == "cancelled":
        raise HTTPException(status_code=400, detail="Purchase is already cancelled")

    old_value = snapshot(purchase)
    reason = (cancel_data.reason or "").strip()
    remarks = f"Cancelled purchase {purchase.purchase_no}" + (f": {reason}" if reason else "")

    products = lock_purchase_products(db, [i.product_id for i in purchase.items], context.tenant_id)
    batches = lock_item_batches(db, purchase.items)
    for item in purchase.items:
        product = products[item.product_id]
        batch = batches.get(item.batch_id)
        current_stock = product.stock_quantity or 0
        available = min(current_stock, batch.quantity_left) if batch else current_stock
        if available < item.quantity:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel: {product.product_name} has only {available} in stock "
                       f"but this purchase added {item.quantity} (some may already be sold)"
            )
        reverse_line(product, item, batch)
        db.add(StockMovement(
            tenant_id=context.tenant_id,
            product_id=item.product_id,
            batch_id=item.batch_id,
            movement_type="adjustment_out",
            quantity=item.quantity,
            reference_type="purchase",
            reference_id=purchase.id,
            remarks=remarks,
            created_by=context.user_id
        ))
    for product in products.values():
        sync_batches(db, product)

    purchase.status = "cancelled"
    if reason:
        purchase.remarks = f"{purchase.remarks}\n{remarks}" if purchase.remarks else remarks
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "purchase", purchase.id, old_value=old_value, new_value=snapshot(purchase))
    db.commit()
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))


# ---------- Supplier bill attachment ----------

BILL_FILE_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def detect_bill_type(content: bytes) -> Optional[str]:
    """Identify the file type from its leading bytes rather than the client-sent header"""
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def require_storage() -> None:
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="Bill storage is not configured")


@router.post("/{purchase_id}/bill", response_model=PurchaseResponse)
async def upload_purchase_bill(
    purchase_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Upload or replace the supplier bill (JPG, PNG, WEBP or PDF) for a purchase (admin only)
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    require_storage()

    max_bytes = settings.BILL_MAX_SIZE_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Bill file is empty")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Bill file must be {settings.BILL_MAX_SIZE_MB} MB or smaller")
    content_type = detect_bill_type(content)
    if not content_type:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP or PDF files are allowed")

    extension = BILL_FILE_TYPES[content_type]
    file_name = os.path.basename((file.filename or "").replace("\\", "/")).strip()[:255] \
        or f"{purchase.purchase_no}{extension}"
    key = f"bills/tenant_{context.tenant_id}/purchase_{purchase.id}/{uuid.uuid4().hex}{extension}"
    try:
        storage.upload_file(key, content, content_type)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not upload bill to storage")

    old_value = snapshot(purchase)
    old_key = purchase.bill_file_key
    purchase.bill_file_key = key
    purchase.bill_file_name = file_name
    purchase.bill_content_type = content_type
    purchase.bill_uploaded_at = datetime.utcnow()
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "purchase", purchase.id, old_value=old_value, new_value=snapshot(purchase))
    db.commit()

    if old_key:
        try:
            storage.delete_file(old_key)
        except Exception:
            pass
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))


@router.get("/{purchase_id}/bill", response_model=PurchaseBillUrl)
async def get_purchase_bill(
    purchase_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get a temporary link to view the supplier bill of a purchase
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if not purchase.bill_file_key:
        raise HTTPException(status_code=404, detail="No bill uploaded for this purchase")
    require_storage()
    return PurchaseBillUrl(
        url=storage.presigned_url(purchase.bill_file_key, purchase.bill_file_name,
                                  purchase.bill_content_type),
        file_name=purchase.bill_file_name,
        content_type=purchase.bill_content_type,
        expires_in=settings.BILL_URL_EXPIRE_SECONDS,
    )


@router.delete("/{purchase_id}/bill", response_model=PurchaseResponse)
async def delete_purchase_bill(
    purchase_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Delete the supplier bill of a purchase (admin only)
    """
    purchase = get_tenant_purchase(db, purchase_id, context.tenant_id)
    if not purchase.bill_file_key:
        raise HTTPException(status_code=404, detail="No bill uploaded for this purchase")
    require_storage()
    try:
        storage.delete_file(purchase.bill_file_key)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not delete bill from storage")

    old_value = snapshot(purchase)
    purchase.bill_file_key = None
    purchase.bill_file_name = None
    purchase.bill_content_type = None
    purchase.bill_uploaded_at = None
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "purchase", purchase.id, old_value=old_value, new_value=snapshot(purchase))
    db.commit()
    return PurchaseResponse.model_validate(get_tenant_purchase(db, purchase_id, context.tenant_id))

