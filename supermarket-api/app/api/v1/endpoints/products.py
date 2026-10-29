"""
Product management endpoints
"""
import logging
from typing import Optional, List
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import ValidationError
from sqlalchemy import func, or_, cast, Integer
from sqlalchemy.orm import Session, joinedload, selectinload
from app.core import product_images, storage
from app.core.config import settings
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.core.batches import (
    generate_instore_barcode, sync_batches, uses_batches, fefo_key, get_product_batch,
    in_stock_batches, scale_barcode, is_scale_barcode, parse_scale_barcode, scale_quantity,
    display_product_name, base_product_name, capitalize_words, next_plu_code, STORE_BRAND
)
from app.core.clearance import ClearanceResolver
from app.core.offers import OfferResolver
from app.models.audit_log import AuditLog
from app.models.product import Product
from app.models.product_batch import ProductBatch
from app.models.category import Category
from app.models.gst_item import GstItem, CategoryGstItem
from app.models.store_location import StoreLocation, ProductLocation
from app.schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    ProductListResponse, ProductSearchResponse,
    ProductBatchResponse, ProductBatchUpdate
)
from app.schemas.store_location import ProductLocationIn, ProductLocationResponse
from app.api.deps import (
    get_current_user, get_current_admin_user, get_current_supervisor_user, get_tenant_context, TenantContext
)
from app.core.product_import import (
    ImportRowError, import_display_name, read_import_file, map_headers, row_to_product_data,
    build_import_template, validation_message, MAX_IMPORT_ROWS, MAX_IMPORT_BYTES
)

router = APIRouter()
logger = logging.getLogger("app.products")

LOOSE_UNITS = ("kg", "g", "L", "ml")
# Packed items are sold per piece; the pack size holds what is inside
PACKED_UNIT = "pcs"


def generate_product_no(db: Session, tenant_id: int) -> str:
    """Generate next sequential product number (P00001, P00002, ...)"""
    last_seq = db.query(
        func.max(cast(func.substring(Product.product_no, 2), Integer))
    ).filter(
        Product.tenant_id == tenant_id,
        Product.product_no.op("~")("^P[0-9]+$")
    ).scalar() or 0
    return f"P{last_seq + 1:05d}"


def ensure_category_in_tenant(db: Session, tenant_id: int, category_id: Optional[int]):
    """Reject a category that does not belong to the tenant"""
    if category_id is None:
        return
    exists = db.query(Category.id).filter(
        Category.id == category_id,
        Category.tenant_id == tenant_id
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail="Invalid category")


def ensure_gst_item(db: Session, tenant_id: int, gst_item_id: Optional[int],
                    category_id: Optional[int]) -> Optional[GstItem]:
    """GST item must exist and, when the category lists GST items, be one of them"""
    if gst_item_id is None:
        return None
    item = db.query(GstItem).filter(GstItem.id == gst_item_id).first()
    if not item:
        raise HTTPException(status_code=400, detail="Invalid GST item")
    if category_id is not None:
        listed = {row.gst_item_id for row in db.query(CategoryGstItem.gst_item_id).filter(
            CategoryGstItem.tenant_id == tenant_id,
            CategoryGstItem.category_id == category_id
        ).all()}
        if listed and gst_item_id not in listed:
            raise HTTPException(status_code=400, detail="GST item is not listed under this category")
    return item


def apply_gst_item(product: Product, item: Optional[GstItem], fill_hsn: bool = False,
                   fill_tax: bool = False):
    """Fill HSN and GST % from the GST item; mark the product overridden when either differs"""
    if item is None:
        product.gst_overridden = False
        return
    expected = item.gst_percent_for(product.product_type)
    if fill_hsn or not (product.hsn_code or "").strip():
        product.hsn_code = item.hsn_code
    if fill_tax:
        product.tax_percent = expected
    product.gst_overridden = not (
        product.hsn_code.startswith(item.hsn_code)
        and Decimal(str(product.tax_percent or 0)) == Decimal(str(expected))
    )


def with_locations():
    return selectinload(Product.locations).joinedload(ProductLocation.location)


def product_snapshot(product: Product) -> dict:
    """Product columns plus its assigned locations for audit logging"""
    locations = "; ".join(
        f"{link.location_code} ({link.role}{', primary' if link.is_primary else ''})"
        for link in product.locations
    )
    return {**snapshot(product), "locations": locations or None}


def ensure_pack_size(net_quantity, net_unit):
    """Pack size is optional, but quantity and unit must be set together"""
    if (net_quantity is None) != (net_unit is None):
        raise HTTPException(status_code=400, detail="Enter both pack size and its unit")


def apply_product_locations(db: Session, product: Product, locations: List[ProductLocationIn]):
    """Sync a product's locations with the given list (add, update primary, remove).
    The role of each assignment follows the location type."""
    location_ids = [loc.location_id for loc in locations]
    if len(location_ids) != len(set(location_ids)):
        raise HTTPException(status_code=400, detail="Duplicate location")

    existing = {link.location_id: link for link in product.locations}
    found = {
        loc.id: loc for loc in db.query(StoreLocation).filter(
            StoreLocation.id.in_(location_ids),
            StoreLocation.tenant_id == product.tenant_id
        ).all()
    } if location_ids else {}
    for location_id in location_ids:
        location = found.get(location_id)
        if not location:
            raise HTTPException(status_code=400, detail="Invalid location")
        if location.status != "active" and location_id not in existing:
            raise HTTPException(status_code=400, detail=f"Location {location.location_code} is inactive")

    roles = {loc.location_id: found[loc.location_id].location_type for loc in locations}
    for role in set(roles.values()):
        if sum(1 for loc in locations if roles[loc.location_id] == role and loc.is_primary) > 1:
            raise HTTPException(status_code=400, detail=f"Only one primary {role} location allowed")

    primary_roles = {roles[loc.location_id] for loc in locations if loc.is_primary}
    for location_id, link in list(existing.items()):
        if location_id not in found:
            product.locations.remove(link)
    for loc in locations:
        role = roles[loc.location_id]
        is_primary = loc.is_primary
        if role not in primary_roles:
            primary_roles.add(role)
            is_primary = True
        link = existing.get(loc.location_id)
        if link:
            link.role, link.is_primary = role, is_primary
        else:
            product.locations.append(ProductLocation(
                tenant_id=product.tenant_id, location_id=loc.location_id,
                role=role, is_primary=is_primary, location=found[loc.location_id]
            ))


def resolve_product_type(product_type: Optional[str], is_loose: Optional[bool],
                         current_type: Optional[str] = None) -> str:
    """Product type from the request; is_loose alone still switches to/from loose"""
    if product_type:
        return product_type
    if is_loose:
        return Product.TYPE_LOOSE
    if is_loose is False and current_type == Product.TYPE_LOOSE:
        return Product.TYPE_OWN_PACKED
    return current_type or Product.TYPE_OWN_PACKED


def ensure_type_rules(product_type: str, unit_type: Optional[str], barcode: Optional[str],
                      instore_barcode: Optional[str] = None, allow_missing_barcode: bool = False):
    """Loose items are sold by weight; manufacturer items need the maker's barcode
    (may be left empty when allow_missing_barcode, e.g. bulk import);
    barcodes starting with 21 are reserved for weighing-scale labels"""
    if product_type == Product.TYPE_LOOSE:
        if unit_type not in LOOSE_UNITS:
            raise HTTPException(status_code=400,
                                detail=f"Loose items must use a unit of {', '.join(LOOSE_UNITS)}")
        return
    if is_scale_barcode(barcode):
        raise HTTPException(status_code=400,
                            detail="Barcodes starting with 21 are reserved for loose products")
    if product_type == Product.TYPE_MANUFACTURER and (not barcode or barcode == instore_barcode):
        if not barcode and allow_missing_barcode:
            return
        raise HTTPException(status_code=400,
                            detail="Enter the barcode printed on the manufacturer's pack")


def resolve_names(data: dict) -> dict:
    """item_name with product_name = display name set by hand; item_name alone = generated name;
    product_name alone (older clients) is taken as the item name"""
    item_name = capitalize_words((data.pop("item_name", None) or "").strip())
    product_name = (data.pop("product_name", None) or "").strip()
    if item_name:
        return {"item_name": item_name, "product_name": product_name or None,
                "name_is_custom": bool(product_name)}
    if product_name:
        return {"item_name": capitalize_words(base_product_name(product_name) or product_name),
                "product_name": None, "name_is_custom": False}
    return {}


def apply_naming(product: Product, previous_type: Optional[str] = None):
    """Loose: no brand. Own packed: brand MF. Display name = item name + pack size + brand
    (MF for own packed, 'Loose' for loose) unless it was set by hand."""
    if product.product_type == Product.TYPE_LOOSE:
        product.brand = None
    elif product.product_type == Product.TYPE_OWN_PACKED:
        product.brand = STORE_BRAND
    elif previous_type and previous_type != Product.TYPE_MANUFACTURER \
            and (product.brand or "").strip().upper() == STORE_BRAND:
        product.brand = None
    elif product.brand:
        product.brand = capitalize_words(product.brand.strip()) or None
    if not product.item_name:
        product.item_name = base_product_name(product.product_name or "") or product.product_name
    if not (product.name_is_custom and product.product_name):
        product.name_is_custom = False
        product.product_name = display_product_name(
            product.product_type, product.item_name, product.net_quantity,
            product.net_unit, product.brand) or product.item_name


def apply_type_codes(db: Session, product: Product, previous_type: Optional[str] = None,
                     allow_missing_barcode: bool = False):
    """Loose: auto item number (PLU) and 21 scale barcode.
    Others: no PLU, and an in-store barcode when none is set
    (a manufacturer item keeps an empty barcode when allow_missing_barcode)."""
    apply_naming(product, previous_type)
    if product.product_type == Product.TYPE_LOOSE:
        if not product.plu_code:
            product.plu_code = next_plu_code(db, product.tenant_id)
        product.barcode = scale_barcode(product.plu_code)
    else:
        product.plu_code = None
        if not product.barcode and allow_missing_barcode \
                and product.product_type == Product.TYPE_MANUFACTURER:
            product.barcode = None
        elif not product.barcode or is_scale_barcode(product.barcode):
            product.barcode = generate_instore_barcode(product.id)


def barcode_used_by_batch(db: Session, tenant_id: int, barcode: str) -> bool:
    return db.query(ProductBatch.id).filter(
        ProductBatch.tenant_id == tenant_id,
        ProductBatch.barcode == barcode
    ).first() is not None


@router.get("", response_model=ProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=1000),
    status: Optional[str] = None,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    low_stock: Optional[bool] = None,
    location_id: Optional[int] = None,
    unassigned: Optional[bool] = None,
    is_loose: Optional[bool] = None,
    product_type: Optional[str] = Query(None, pattern="^(manufacturer|own_packed|loose)$"),
    missing_barcode: Optional[bool] = None,
    expiry: Optional[str] = Query(None, pattern="^(expired|7|30)$"),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List products for current tenant
    """
    query = db.query(Product).options(joinedload(Product.category), with_locations()).filter(
        Product.tenant_id == context.tenant_id
    )

    if status:
        query = query.filter(Product.status == status)

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if location_id:
        query = query.filter(Product.locations.any(ProductLocation.location_id == location_id))

    if unassigned:
        query = query.filter(~Product.locations.any())

    if is_loose is not None:
        query = query.filter(Product.is_loose == is_loose)

    if product_type:
        query = query.filter(Product.product_type == product_type)

    if missing_barcode:
        query = query.filter(or_(Product.barcode.is_(None), Product.barcode == ""))

    if expiry:
        today = date.today()
        if expiry == "expired":
            query = query.filter(Product.expiry_date < today)
        else:
            query = query.filter(Product.expiry_date >= today,
                                 Product.expiry_date <= today + timedelta(days=int(expiry)))

    words = search.split() if search else []
    for word in words:
        pattern = f"%{word}%"
        query = query.filter(or_(
            Product.product_name.ilike(pattern),
            Product.product_no.ilike(pattern),
            Product.barcode.ilike(pattern)
        ))

    if low_stock:
        query = query.filter(Product.stock_quantity <= Product.reorder_level)

    total = query.count()
    order = [Product.product_name]
    if expiry:
        order.insert(0, Product.expiry_date)
    if words:
        order.insert(0, Product.product_name.ilike(f"{words[0]}%").desc())
    items = query.order_by(*order).offset((page - 1) * page_size).limit(page_size).all()
    
    return ProductListResponse(
        items=[ProductResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/search")
async def search_product(
    barcode: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Search product by barcode or product number (for billing)
    """
    query = db.query(Product).options(with_locations()).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active"
    )

    scanned_batch = None
    scanned_weight = None
    if barcode:
        barcode = barcode.strip()
        scanned_batch = db.query(ProductBatch).filter(
            ProductBatch.tenant_id == context.tenant_id,
            ProductBatch.barcode == barcode
        ).first()
        if scanned_batch:
            query = query.filter(Product.id == scanned_batch.product_id)
        elif is_scale_barcode(barcode):
            plu_code, scanned_weight = parse_scale_barcode(barcode)
            query = query.filter(Product.product_type == Product.TYPE_LOOSE,
                                 Product.plu_code == plu_code)
        else:
            query = query.filter(or_(Product.barcode == barcode, Product.product_no == barcode))
    elif product_no:
        query = query.filter(Product.product_no == product_no)
    else:
        raise HTTPException(status_code=400, detail="Provide barcode or product_no")

    product = query.first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    batches = []
    if uses_batches(product):
        batches = sync_batches(db, product)
        db.commit()
    price_source = scanned_batch or (batches[0] if batches else None)
    if price_source:
        selling_price = price_source.selling_price or price_source.mrp or product.selling_price or product.mrp
        mrp = price_source.mrp
    else:
        selling_price = product.selling_price or product.mrp
        mrp = product.mrp

    clearance = ClearanceResolver(db, context.tenant_id)
    batch_responses = []
    for b in batches:
        response = ProductBatchResponse.model_validate(b)
        response.clearance_percent = clearance.percent(product, b)
        batch_responses.append(response)
    offer = OfferResolver(db, context.tenant_id).best(product.id, Decimal(selling_price or 0))

    return ProductSearchResponse(
        id=product.id,
        product_no=product.product_no,
        product_name=product.product_name,
        barcode=product.barcode,
        selling_price=selling_price or 0,
        mrp=mrp,
        tax_percent=product.tax_percent or 0,
        stock_quantity=product.stock_quantity or 0,
        unit_type=product.unit_type or "pcs",
        is_loose=bool(product.is_loose),
        product_type=product.product_type,
        plu_code=product.plu_code,
        hsn_code=product.hsn_code,
        locations=[ProductLocationResponse.model_validate(link) for link in product.locations],
        batch_id=scanned_batch.id if scanned_batch else None,
        batches=batch_responses,
        scanned_quantity=scale_quantity(scanned_weight, product.unit_type) if scanned_weight else None,
        clearance_percent=Decimal("0") if uses_batches(product) else clearance.percent(product),
        offer_id=offer.offer_id if offer else None,
        offer_name=offer.offer.name if offer else None,
        offer_type=offer.discount_type if offer else None,
        offer_value=offer.discount_value if offer else None,
    )


@router.get("/import/template")
async def download_import_template(
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Excel template for bulk product import (admin only)
    """
    return Response(
        content=build_import_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="product_import_template.xlsx"'}
    )


@router.post("/import")
async def import_products(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Bulk create products from an Excel (.xlsx) or CSV file (admin only).
    Valid rows are created; rows matching an existing product (same display name and type)
    are skipped; invalid rows are reported as failed.
    dry_run=true checks the file and reports the result without saving anything.
    """
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=400,
                            detail=f"File is larger than {MAX_IMPORT_BYTES // (1024 * 1024)} MB")
    headers, rows = read_import_file(file.filename or "", content)
    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=400,
                            detail=f"File has {len(rows)} rows; the limit is {MAX_IMPORT_ROWS} per import")
    columns = map_headers(headers)

    existing_names = {
        (name.lower(), ptype): no for name, ptype, no in db.query(
            Product.product_name, Product.product_type, Product.product_no
        ).filter(Product.tenant_id == context.tenant_id).all()
    }
    file_names: dict = {}

    created = 0
    issues = []
    for row_no, values in rows:
        def report(state: str, reason: str):
            issues.append({"row": row_no, "status": state, "reason": reason,
                           "values": ["" if v is None else str(v) for v in values]})

        try:
            data = row_to_product_data(values, columns)
            product_data = ProductCreate(**data)
        except ImportRowError as exc:
            report("failed", str(exc))
            continue
        except ValidationError as exc:
            report("failed", validation_message(exc))
            continue

        product_type = product_data.product_type
        name_key = (import_display_name(product_data).lower(), product_type)
        if name_key in file_names:
            report("skipped", f"Duplicate of row {file_names[name_key]} (same name and type)")
            continue
        if name_key in existing_names:
            report("skipped", f"Product already exists ({existing_names[name_key]})")
            continue

        savepoint = db.begin_nested()
        try:
            product = build_product(db, request, context, product_data, allow_missing_barcode=True)
            savepoint.commit()
        except HTTPException as exc:
            savepoint.rollback()
            report("failed", str(exc.detail))
            continue
        created += 1
        file_names.setdefault(name_key, row_no)
        existing_names.setdefault((product.product_name.lower(), product_type), product.product_no)

    if dry_run:
        db.rollback()
    else:
        db.commit()

    return {
        "dry_run": dry_run,
        "total": len(rows),
        "created": created,
        "skipped": sum(1 for i in issues if i["status"] == "skipped"),
        "failed": sum(1 for i in issues if i["status"] == "failed"),
        "columns": ["" if h is None else str(h) for h in headers],
        "issues": issues,
    }


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get product by ID
    """
    product = db.query(Product).options(joinedload(Product.category), with_locations()).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductResponse.model_validate(product)


@router.get("/{product_id}/batches", response_model=List[ProductBatchResponse])
async def list_product_batches(
    product_id: int,
    in_stock: bool = True,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Stock batches of a product (first expiry first); in_stock=false includes sold-out batches
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not uses_batches(product):
        return []

    batches = sync_batches(db, product)
    db.commit()
    if not in_stock:
        batches = sorted(db.query(ProductBatch).filter(ProductBatch.product_id == product.id).all(),
                         key=fefo_key)
    return [ProductBatchResponse.model_validate(b) for b in batches]


@router.put("/{product_id}/batches/{batch_id}", response_model=ProductBatchResponse)
async def update_product_batch(
    product_id: int,
    batch_id: int,
    batch_data: ProductBatchUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Correct the MRP, selling price, expiry or batch number of a batch (admin only)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    batch = get_product_batch(db, product, batch_id)

    update_data = batch_data.model_dump(exclude_unset=True)
    mrp = update_data.get("mrp", batch.mrp)
    selling_price = update_data.get("selling_price", batch.selling_price)
    if mrp is not None and selling_price is not None and selling_price > mrp:
        raise HTTPException(status_code=400, detail="Selling price cannot be greater than MRP")

    old_value = snapshot(batch)
    for field, value in update_data.items():
        setattr(batch, field, value)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "product_batch", batch.id, old_value=old_value, new_value=snapshot(batch))
    db.commit()
    db.refresh(batch)
    return ProductBatchResponse.model_validate(batch)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    product_data: ProductCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new product (admin only)
    """
    product = build_product(db, request, context, product_data)
    db.commit()
    db.refresh(product)

    return ProductResponse.model_validate(product)


def build_product(db: Session, request: Optional[Request], context: TenantContext,
                  product_data: ProductCreate, allow_missing_barcode: bool = False) -> Product:
    """Validate and add a new product with its audit entry; the caller commits"""
    product_data.product_no = (product_data.product_no or "").strip() or None
    product_data.barcode = (product_data.barcode or "").strip() or None

    if product_data.product_no:
        existing = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.product_no == product_data.product_no
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product number already exists")
    else:
        product_data.product_no = generate_product_no(db, context.tenant_id)

    product_data.product_type = resolve_product_type(product_data.product_type, product_data.is_loose)
    product_data.is_loose = product_data.product_type == Product.TYPE_LOOSE
    if product_data.is_loose:
        product_data.barcode = None
    else:
        product_data.unit_type = PACKED_UNIT
    ensure_type_rules(product_data.product_type, product_data.unit_type, product_data.barcode,
                      allow_missing_barcode=allow_missing_barcode)
    ensure_pack_size(product_data.net_quantity, product_data.net_unit)
    ensure_category_in_tenant(db, context.tenant_id, product_data.category_id)
    gst_item = ensure_gst_item(db, context.tenant_id, product_data.gst_item_id, product_data.category_id)

    # Check if barcode already exists (if provided)
    if product_data.barcode:
        existing_barcode = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.barcode == product_data.barcode
        ).first()
        if existing_barcode or barcode_used_by_batch(db, context.tenant_id, product_data.barcode):
            raise HTTPException(status_code=400, detail="Barcode already exists")

    data = product_data.model_dump(exclude={"locations"})
    data.update(resolve_names(data))
    product = Product(
        tenant_id=context.tenant_id,
        **data,
        created_by=context.user_id
    )
    apply_naming(product)
    apply_gst_item(product, gst_item, fill_tax="tax_percent" not in product_data.model_fields_set)

    db.add(product)
    db.flush()
    apply_type_codes(db, product, allow_missing_barcode=allow_missing_barcode)
    if product_data.locations:
        apply_product_locations(db, product, product_data.locations)
    sync_batches(db, product)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "product", product.id, new_value=product_snapshot(product))
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_supervisor_user)
):
    """
    Update a product (admin or supervisor)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check for duplicate barcode if updating
    if product_data.barcode and product_data.barcode != product.barcode:
        existing = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.barcode == product_data.barcode,
            Product.id != product_id
        ).first()
        if existing or barcode_used_by_batch(db, context.tenant_id, product_data.barcode):
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    update_data = product_data.model_dump(exclude_unset=True, exclude={"locations"})
    if "barcode" in update_data and not (update_data["barcode"] or "").strip():
        update_data.pop("barcode")
    update_data.update(resolve_names(update_data))

    mrp = update_data.get("mrp", product.mrp)
    selling_price = update_data.get("selling_price", product.selling_price)
    if mrp is not None and selling_price is not None and selling_price > mrp:
        raise HTTPException(status_code=400, detail="Selling price cannot be greater than MRP")

    product_type = resolve_product_type(update_data.get("product_type"), update_data.get("is_loose"),
                                        product.product_type)
    update_data["product_type"] = product_type
    update_data["is_loose"] = product_type == Product.TYPE_LOOSE
    if update_data["is_loose"]:
        update_data.pop("barcode", None)
    else:
        update_data["unit_type"] = PACKED_UNIT
        if product.is_loose and "barcode" not in update_data:
            update_data["barcode"] = None
    # A manufacturer item imported without a barcode may stay without one until it is entered
    keep_missing_barcode = (product_type == product.product_type == Product.TYPE_MANUFACTURER
                            and not product.barcode)
    ensure_type_rules(product_type, update_data.get("unit_type", product.unit_type),
                      update_data.get("barcode", product.barcode),
                      generate_instore_barcode(product.id) if product_type != product.product_type else None,
                      allow_missing_barcode=keep_missing_barcode)
    ensure_pack_size(update_data.get("net_quantity", product.net_quantity),
                     update_data.get("net_unit", product.net_unit))
    if "category_id" in update_data:
        ensure_category_in_tenant(db, context.tenant_id, update_data["category_id"])
    if "gst_item_id" in update_data and update_data["gst_item_id"] is None:
        if product.gst_item_id:
            raise HTTPException(status_code=400, detail="GST item cannot be removed")
        update_data.pop("gst_item_id")
    gst_item_id = update_data.get("gst_item_id", product.gst_item_id)
    category_id = update_data.get("category_id", product.category_id)
    gst_item_changed = gst_item_id != product.gst_item_id
    if gst_item_changed or category_id != product.category_id:
        gst_item = ensure_gst_item(db, context.tenant_id, gst_item_id, category_id)
    else:
        gst_item = product.gst_item

    old_value = product_snapshot(product)
    was_loose = bool(product.is_loose)
    previous_type = product.product_type
    previous_expiry = product.expiry_date
    for field, value in update_data.items():
        setattr(product, field, value)
    apply_gst_item(product, gst_item, fill_hsn=gst_item_changed and "hsn_code" not in update_data,
                   fill_tax=gst_item_changed and "tax_percent" not in update_data)
    apply_type_codes(db, product, previous_type, allow_missing_barcode=keep_missing_barcode)
    if product_data.locations is not None:
        apply_product_locations(db, product, product_data.locations)

    product.updated_by = context.user_id
    db.flush()
    if was_loose != product.is_loose:
        sync_batches(db, product)
    if product.expiry_date != previous_expiry and uses_batches(product):
        # Opening / adjustment stock follows the product's expiry; purchase batches keep their own
        for batch in in_stock_batches(db, product):
            if batch.purchase_id is None and batch.expiry_date != product.expiry_date:
                batch_old = snapshot(batch)
                batch.expiry_date = product.expiry_date
                db.flush()
                record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                             "product_batch", batch.id, old_value=batch_old, new_value=snapshot(batch))
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "product", product.id, old_value=old_value, new_value=product_snapshot(product))
    db.commit()
    db.refresh(product)

    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Deactivate a product (admin only). Soft delete keeps sales/purchase history intact.
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    old_value = snapshot(product)
    product.status = "inactive"
    product.updated_by = context.user_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "product", product.id, old_value=old_value, new_value=snapshot(product))
    db.commit()


def _delete_image_files(key: Optional[str], product_id: int) -> None:
    """Remove an image's files from storage; a failure only leaves unused files behind"""
    if not key:
        return
    for name in product_images.file_keys(key):
        try:
            storage.delete_file(name)
        except Exception:
            logger.warning("Could not delete image %s of product %s", name, product_id,
                           exc_info=True)


def _set_image(db: Session, request: Request, context: TenantContext, product: Product,
               key: Optional[str]) -> Product:
    old_key = product.image_key
    product.image_key = key
    product.image_updated_at = datetime.utcnow() if key else None
    product.updated_by = context.user_id
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "product", product.id, old_value={"image_key": old_key},
                 new_value={"image_key": key})
    db.commit()
    _delete_image_files(old_key, product.id)
    return db.query(Product).options(joinedload(Product.category), with_locations()).filter(
        Product.id == product.id).one()


@router.post("/{product_id}/image", response_model=ProductResponse)
async def upload_product_image(
    product_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_supervisor_user)
):
    """
    Upload or replace the product picture: JPG, PNG or WEBP, saved as 800 px and 320 px WebP
    (admin or supervisor)
    """
    product = db.query(Product).filter(Product.id == product_id,
                                       Product.tenant_id == context.tenant_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="Image storage is not configured")
    max_bytes = settings.PRODUCT_IMAGE_MAX_MB * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The picture file is empty")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"The picture must be "
                                                    f"{settings.PRODUCT_IMAGE_MAX_MB} MB or smaller")
    large, thumb = await run_in_threadpool(product_images.process, content)

    key = product_images.new_key(context.tenant_id, product.id)
    large_key, thumb_key = product_images.file_keys(key)
    try:
        storage.upload_file(large_key, large, product_images.CONTENT_TYPE)
        storage.upload_file(thumb_key, thumb, product_images.CONTENT_TYPE)
    except Exception:
        logger.exception("Image upload failed for product %s (key %s)", product.id, key)
        _delete_image_files(key, product.id)
        raise HTTPException(status_code=502, detail="Could not save the picture to storage")
    return ProductResponse.model_validate(_set_image(db, request, context, product, key))


@router.delete("/{product_id}/image", response_model=ProductResponse)
async def delete_product_image(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_supervisor_user)
):
    """
    Remove the product picture (admin or supervisor)
    """
    product = db.query(Product).filter(Product.id == product_id,
                                       Product.tenant_id == context.tenant_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.image_key:
        return ProductResponse.model_validate(product)
    return ProductResponse.model_validate(_set_image(db, request, context, product, None))

