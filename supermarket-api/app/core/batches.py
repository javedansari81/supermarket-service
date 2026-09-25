"""
Stock batch helpers. Packed products hold stock in batches (one per MRP / price / expiry);
loose products keep only the product-level stock and price.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.product import Product
from app.models.product_batch import ProductBatch


def ean13_check_digit(code12: str) -> str:
    """Compute EAN-13 check digit for a 12-digit string"""
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code12))
    return str((10 - total % 10) % 10)


def generate_instore_barcode(product_id: int) -> str:
    """In-store EAN-13 (GS1 prefix 2 = restricted circulation, for items without a maker barcode)"""
    code12 = f"2{product_id:011d}"
    return code12 + ean13_check_digit(code12)


def generate_batch_barcode(batch_id: int) -> str:
    """In-store EAN-13 for one batch (prefix 29), so a scan identifies the batch and its MRP"""
    code12 = f"29{batch_id:010d}"
    return code12 + ean13_check_digit(code12)


def uses_batches(product: Product) -> bool:
    return not product.is_loose


def fefo_key(batch: ProductBatch):
    """First expiry first out; batches without expiry last, then oldest first"""
    return (batch.expiry_date is None, batch.expiry_date or date.max, batch.id)


def in_stock_batches(db: Session, product: Product, lock: bool = False) -> List[ProductBatch]:
    query = db.query(ProductBatch).filter(
        ProductBatch.product_id == product.id,
        ProductBatch.quantity_left > 0
    )
    if lock:
        query = query.order_by(ProductBatch.id).with_for_update()
    return sorted(query.all(), key=fefo_key)


def create_batch(db: Session, product: Product, *, mrp, selling_price, purchase_price,
                 expiry_date: Optional[date] = None, batch_no: Optional[str] = None,
                 purchase_id: Optional[int] = None) -> ProductBatch:
    batch = ProductBatch(
        tenant_id=product.tenant_id, product_id=product.id, batch_no=batch_no,
        mrp=mrp, selling_price=selling_price, purchase_price=purchase_price,
        expiry_date=expiry_date, quantity_received=0, quantity_left=0, purchase_id=purchase_id
    )
    db.add(batch)
    db.flush()
    return batch


def sync_batches(db: Session, product: Product) -> List[ProductBatch]:
    """Lock the product's in-stock batches and reconcile them with product.stock_quantity.
    Stock without a batch (legacy data, opening stock) goes to an opening batch at the
    product's current prices; a shortfall is taken from batches first-expiry-first."""
    if not uses_batches(product):
        return []
    batches = in_stock_batches(db, product, lock=True)
    stock = Decimal(product.stock_quantity or 0)
    diff = stock - sum((b.quantity_left for b in batches), Decimal("0"))
    if diff > 0:
        opening = next((b for b in batches if b.batch_no == ProductBatch.OPENING
                        and b.mrp == product.mrp and b.selling_price == product.selling_price), None)
        if not opening:
            opening = create_batch(db, product, mrp=product.mrp, selling_price=product.selling_price,
                                   purchase_price=product.purchase_price,
                                   expiry_date=product.expiry_date, batch_no=ProductBatch.OPENING)
            batches = sorted(batches + [opening], key=fefo_key)
        opening.quantity_received = (opening.quantity_received or 0) + diff
        opening.quantity_left = (opening.quantity_left or 0) + diff
    elif diff < 0:
        for batch, qty in allocate(batches, -diff):
            batch.quantity_left -= qty
        batches = [b for b in batches if b.quantity_left > 0]
    return batches


def match_or_create_batch(db: Session, product: Product, *, mrp, selling_price, purchase_price,
                          expiry_date: Optional[date] = None, batch_no: Optional[str] = None,
                          purchase_id: Optional[int] = None,
                          candidates: Optional[List[ProductBatch]] = None) -> ProductBatch:
    """Reuse an in-stock batch (or one of `candidates`) with the same MRP, selling price,
    expiry and batch number; otherwise start a new batch. Quantities are left to the caller."""
    pool = list(candidates or []) + in_stock_batches(db, product)
    for batch in pool:
        if (batch.product_id == product.id and batch.mrp == mrp
                and batch.selling_price == selling_price and batch.expiry_date == expiry_date
                and (batch.batch_no or None) == (batch_no or None)):
            if purchase_price is not None:
                batch.purchase_price = purchase_price
            return batch
    return create_batch(db, product, mrp=mrp, selling_price=selling_price,
                        purchase_price=purchase_price, expiry_date=expiry_date,
                        batch_no=batch_no, purchase_id=purchase_id)


def allocate(batches: List[ProductBatch], quantity: Decimal) -> List[Tuple[ProductBatch, Decimal]]:
    """Split a quantity across batches in the given order; raises if stock is short"""
    parts = []
    remaining = Decimal(quantity)
    for batch in batches:
        if remaining <= 0:
            break
        take = min(Decimal(batch.quantity_left), remaining)
        if take > 0:
            parts.append((batch, take))
            remaining -= take
    if remaining > 0:
        raise HTTPException(status_code=400, detail="Insufficient batch stock")
    return parts


def distinct_mrps(batches: List[ProductBatch]) -> List[Optional[Decimal]]:
    mrps = []
    for batch in batches:
        if batch.mrp not in mrps:
            mrps.append(batch.mrp)
    return mrps


def get_product_batch(db: Session, product: Product, batch_id: int) -> ProductBatch:
    batch = db.query(ProductBatch).filter(
        ProductBatch.id == batch_id,
        ProductBatch.product_id == product.id,
        ProductBatch.tenant_id == product.tenant_id
    ).first()
    if not batch:
        raise HTTPException(status_code=400, detail=f"Batch {batch_id} not found for {product.product_name}")
    return batch


def ensure_batch_barcode(db: Session, batch: ProductBatch) -> str:
    """Assign the batch's in-store barcode on first use"""
    if not batch.barcode:
        code = generate_batch_barcode(batch.id)
        if db.query(Product.id).filter(Product.tenant_id == batch.tenant_id, Product.barcode == code).first():
            raise HTTPException(status_code=400, detail="Generated batch barcode is already used by a product")
        batch.barcode = code
        db.flush()
    return batch.barcode
