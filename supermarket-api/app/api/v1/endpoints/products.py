"""
Product management endpoints
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy import func, or_, cast, Integer
from sqlalchemy.orm import Session, joinedload, selectinload
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.product import Product
from app.models.category import Category
from app.models.store_location import StoreLocation, ProductLocation
from app.schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    ProductListResponse, ProductSearchResponse
)
from app.schemas.store_location import ProductLocationIn, ProductLocationResponse
from app.api.deps import get_current_user, get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()

LOOSE_UNITS = ("kg", "g", "ltr", "ml")


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


def with_locations():
    return selectinload(Product.locations).joinedload(ProductLocation.location)


def product_snapshot(product: Product) -> dict:
    """Product columns plus its assigned locations for audit logging"""
    locations = "; ".join(
        f"{link.location_code} ({link.role}{', primary' if link.is_primary else ''})"
        for link in product.locations
    )
    return {**snapshot(product), "locations": locations or None}


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


def ean13_check_digit(code12: str) -> str:
    """Compute EAN-13 check digit for a 12-digit string"""
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code12))
    return str((10 - total % 10) % 10)


def generate_instore_barcode(product_id: int) -> str:
    """In-store EAN-13 (GS1 prefix 2 = restricted circulation, for items without a maker barcode)"""
    code12 = f"2{product_id:011d}"
    return code12 + ean13_check_digit(code12)


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
    
    if barcode:
        query = query.filter(or_(Product.barcode == barcode, Product.product_no == barcode))
    elif product_no:
        query = query.filter(Product.product_no == product_no)
    else:
        raise HTTPException(status_code=400, detail="Provide barcode or product_no")
    
    product = query.first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductSearchResponse(
        id=product.id,
        product_no=product.product_no,
        product_name=product.product_name,
        barcode=product.barcode,
        selling_price=product.selling_price or product.mrp or 0,
        mrp=product.mrp,
        tax_percent=product.tax_percent or 0,
        stock_quantity=product.stock_quantity or 0,
        unit_type=product.unit_type or "pcs",
        is_loose=bool(product.is_loose),
        hsn_code=product.hsn_code,
        locations=[ProductLocationResponse.model_validate(link) for link in product.locations]
    )


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

    if product_data.is_loose and product_data.unit_type not in LOOSE_UNITS:
        raise HTTPException(status_code=400, detail=f"Loose items must use a unit of {', '.join(LOOSE_UNITS)}")
    ensure_category_in_tenant(db, context.tenant_id, product_data.category_id)

    # Check if barcode already exists (if provided)
    if product_data.barcode:
        existing_barcode = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.barcode == product_data.barcode
        ).first()
        if existing_barcode:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    product = Product(
        tenant_id=context.tenant_id,
        **product_data.model_dump(exclude={"locations"}),
        created_by=context.user_id
    )

    db.add(product)
    db.flush()
    if not product.barcode:
        product.barcode = generate_instore_barcode(product.id)
    if product_data.locations:
        apply_product_locations(db, product, product_data.locations)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "product", product.id, new_value=product_snapshot(product))
    db.commit()
    db.refresh(product)

    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a product (admin only)
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
        if existing:
            raise HTTPException(status_code=400, detail="Barcode already exists")
    
    update_data = product_data.model_dump(exclude_unset=True, exclude={"locations"})
    if "barcode" in update_data and not (update_data["barcode"] or "").strip():
        update_data.pop("barcode")

    mrp = update_data.get("mrp", product.mrp)
    selling_price = update_data.get("selling_price", product.selling_price)
    if mrp is not None and selling_price is not None and selling_price > mrp:
        raise HTTPException(status_code=400, detail="Selling price cannot be greater than MRP")

    is_loose = update_data.get("is_loose", product.is_loose)
    unit_type = update_data.get("unit_type", product.unit_type)
    if is_loose and unit_type not in LOOSE_UNITS:
        raise HTTPException(status_code=400, detail=f"Loose items must use a unit of {', '.join(LOOSE_UNITS)}")
    if "category_id" in update_data:
        ensure_category_in_tenant(db, context.tenant_id, update_data["category_id"])

    old_value = product_snapshot(product)
    for field, value in update_data.items():
        setattr(product, field, value)
    if product_data.locations is not None:
        apply_product_locations(db, product, product_data.locations)

    product.updated_by = context.user_id
    db.flush()
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

