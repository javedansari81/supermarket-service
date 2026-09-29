"""
Stock batch helpers. Packed products hold stock in batches (one per MRP / price / expiry);
loose products keep only the product-level stock and price.
"""
import re
from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import func
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


SCALE_PREFIX = "21"
# Loose unit -> units per gram/ml encoded in the scale label
SCALE_UNIT_FACTORS = {"kg": Decimal("0.001"), "L": Decimal("0.001"),
                      "g": Decimal("1"), "ml": Decimal("1")}


def scale_barcode(plu_code: int, weight: int = 0) -> str:
    """Weighing-scale EAN-13: 21 + PLU (5 digits) + weight in g/ml (5 digits) + check digit.
    With weight 0 it is the product's reference barcode."""
    code12 = f"{SCALE_PREFIX}{plu_code:05d}{weight:05d}"
    return code12 + ean13_check_digit(code12)


def is_scale_barcode(code: Optional[str]) -> bool:
    return bool(code) and len(code) == 13 and code.isdigit() and code.startswith(SCALE_PREFIX)


def parse_scale_barcode(code: str) -> Tuple[int, int]:
    """(PLU, weight in g/ml) from a scale label; raises on a wrong check digit"""
    if ean13_check_digit(code[:12]) != code[12]:
        raise HTTPException(status_code=400, detail="Invalid scale label barcode (check digit)")
    return int(code[2:7]), int(code[7:12])


def scale_quantity(weight: int, unit_type: Optional[str]) -> Decimal:
    """Weight from a scale label in the product's unit (e.g. 1250 g -> 1.25 kg)"""
    return Decimal(weight) * SCALE_UNIT_FACTORS.get(unit_type or "kg", Decimal("0.001"))


STORE_BRAND = "MF"


UNIT_WORDS = {"g", "gm", "gms", "kg", "kgs", "ml", "l", "ltr", "pcs", "pages"}


def capitalize_words(text: str) -> str:
    """'toor dal' -> 'Toor Dal'; unit words (kg, ml) and words already containing
    capitals (ORS, iPhone) are kept"""
    def cap(m):
        word = m.group()
        if not word.islower() or word in UNIT_WORDS:
            return word
        return word[0].upper() + word[1:]
    return re.sub(r"\S+", cap, text)


def base_product_name(name: str) -> str:
    """Product name without the type suffix ('Loose' / 'MF') or a leading store brand"""
    base = name.strip()
    base = re.sub(rf"^{STORE_BRAND}\s+", "", base, flags=re.IGNORECASE)
    base = re.sub(rf"[\s-]*\(?\s*(loose|{STORE_BRAND})\s*\)?\s*$", "", base, flags=re.IGNORECASE)
    return base.strip()


def loose_product_name(name: str) -> str:
    """Naming convention for loose products: no brand, name ends with 'Loose'"""
    base = base_product_name(name)
    return f"{base} Loose" if base else "Loose"


def pack_size_label(net_quantity: Optional[Decimal], net_unit: Optional[str]) -> str:
    """Pack size for display names (e.g. '1 kg', '500 g', '1.5 L'); a single piece shows nothing"""
    if net_quantity is None or not net_unit:
        return ""
    quantity = Decimal(net_quantity)
    if net_unit == "pcs" and quantity == 1:
        return ""
    text = format(quantity.normalize(), "f")
    return f"{text} {net_unit}"


def display_product_name(product_type: str, item_name: str, net_quantity: Optional[Decimal] = None,
                         net_unit: Optional[str] = None, brand: Optional[str] = None) -> str:
    """Display name built from its parts, brand last:
    manufacturer 'Salt 1 kg Tata', own packed 'Toor Dal 1 kg MF', loose 'Toor Dal Loose'"""
    base = base_product_name(item_name or "")
    if product_type == Product.TYPE_LOOSE:
        return loose_product_name(base)
    size = pack_size_label(net_quantity, net_unit)
    last = STORE_BRAND if product_type == Product.TYPE_OWN_PACKED else (brand or "").strip()
    return " ".join(part for part in (base, size, last) if part)


def next_plu_code(db: Session, tenant_id: int) -> int:
    """Item numbers (PLU) for loose products, from 1 upwards per store"""
    last = db.query(func.max(Product.plu_code)).filter(Product.tenant_id == tenant_id).scalar() or 0
    if last >= 99999:
        raise HTTPException(status_code=400, detail="No free item numbers (PLU) left")
    return last + 1


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
