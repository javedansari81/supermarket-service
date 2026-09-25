"""
Store location management endpoints
"""
import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.product import Product
from app.models.store_location import StoreLocation, ProductLocation
from app.schemas.store_location import (
    StoreLocationCreate, StoreLocationUpdate, StoreLocationResponse, StoreLocationListResponse,
    LocationProduct, LocationSuggestion
)
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()

CODE_PART = re.compile(r"^[A-Z0-9]+$")


def get_tenant_location(db: Session, location_id: int, tenant_id: int) -> StoreLocation:
    location = db.query(StoreLocation).filter(
        StoreLocation.id == location_id,
        StoreLocation.tenant_id == tenant_id
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


def ensure_code_unique(db: Session, tenant_id: int, code: str, exclude_id: Optional[int] = None):
    query = db.query(StoreLocation.id).filter(
        StoreLocation.tenant_id == tenant_id,
        StoreLocation.location_code == code
    )
    if exclude_id:
        query = query.filter(StoreLocation.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Location code already exists")


def normalize_part(value: Optional[str], label: str) -> Optional[str]:
    """Upper-case and validate a rack / shelf value (letters and digits only)"""
    value = (value or "").strip().upper()
    if not value:
        return None
    if not CODE_PART.match(value):
        raise HTTPException(status_code=400, detail=f"{label} may contain only letters and digits")
    return value


def ensure_rack_matches_type(rack_no: str, location_type: str):
    prefix = StoreLocation.RACK_PREFIX[location_type]
    if not rack_no.startswith(prefix):
        raise HTTPException(status_code=400,
                            detail=f"{location_type.capitalize()} rack must start with {prefix}")


def rack_floor(db: Session, tenant_id: int, rack_no: str,
               exclude_id: Optional[int] = None) -> Optional[str]:
    """Floor of an existing rack (other than the given location), if any"""
    query = db.query(StoreLocation.floor).filter(
        StoreLocation.tenant_id == tenant_id,
        StoreLocation.rack_no == rack_no
    )
    if exclude_id:
        query = query.filter(StoreLocation.id != exclude_id)
    row = query.first()
    return row[0] if row else None


def sync_link_roles(db: Session, location: StoreLocation):
    """Product assignments follow the location type; keep one primary per product and role"""
    links = db.query(ProductLocation).filter(ProductLocation.location_id == location.id).all()
    for link in links:
        if link.role == location.location_type:
            continue
        link.role = location.location_type
        if link.is_primary and db.query(ProductLocation.id).filter(
            ProductLocation.product_id == link.product_id,
            ProductLocation.role == location.location_type,
            ProductLocation.is_primary.is_(True),
            ProductLocation.id != link.id
        ).first():
            link.is_primary = False


def next_number(values: List[str], prefix: str = "") -> int:
    numbers = [int(v[len(prefix):]) for v in values
               if v and v.startswith(prefix) and v[len(prefix):].isdigit()]
    return max(numbers, default=0) + 1


@router.get("", response_model=StoreLocationListResponse)
async def list_locations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=1000),
    status: Optional[str] = None,
    location_type: Optional[str] = None,
    floor: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List store locations for current tenant
    """
    query = db.query(StoreLocation).filter(
        StoreLocation.tenant_id == context.tenant_id
    )
    if status:
        query = query.filter(StoreLocation.status == status)
    if location_type:
        query = query.filter(StoreLocation.location_type == location_type)
    if floor:
        query = query.filter(StoreLocation.floor == floor)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(
            StoreLocation.location_code.ilike(pattern),
            StoreLocation.description.ilike(pattern)
        ))

    total = query.count()
    items = query.order_by(StoreLocation.location_code).offset((page - 1) * page_size).limit(page_size).all()

    return StoreLocationListResponse(
        items=[StoreLocationResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/active")
async def list_active_locations(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List active locations (for dropdowns)
    """
    locations = db.query(StoreLocation).filter(
        StoreLocation.tenant_id == context.tenant_id,
        StoreLocation.status == "active"
    ).order_by(StoreLocation.location_code).all()

    return [{"id": l.id, "location_code": l.location_code, "location_type": l.location_type,
             "floor": l.floor, "rack_no": l.rack_no, "shelf_no": l.shelf_no} for l in locations]


@router.get("/suggest", response_model=LocationSuggestion)
async def suggest_location(
    location_type: str = Query(..., pattern="^(display|storage|promo)$"),
    rack_no: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Suggest the next rack for a type (last rack + 1, shelf 1), or the next shelf of the
    given rack (last shelf + 1) together with that rack's floor
    """
    prefix = StoreLocation.RACK_PREFIX[location_type]
    rows = db.query(StoreLocation.rack_no, StoreLocation.shelf_no, StoreLocation.floor).filter(
        StoreLocation.tenant_id == context.tenant_id,
        StoreLocation.location_type == location_type
    ).all()
    racks = sorted({r.rack_no for r in rows})
    rack = (rack_no or "").strip().upper()
    if rack and rack in racks:
        rack_rows = [r for r in rows if r.rack_no == rack]
        return LocationSuggestion(location_type=location_type, rack_no=rack,
                                  shelf_no=str(next_number([r.shelf_no for r in rack_rows])),
                                  floor=rack_rows[0].floor, existing_racks=racks)
    return LocationSuggestion(location_type=location_type,
                              rack_no=rack or f"{prefix}{next_number(racks, prefix):02d}",
                              shelf_no="1", existing_racks=racks)


@router.get("/{location_id}", response_model=StoreLocationResponse)
async def get_location(
    location_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get store location by ID
    """
    return StoreLocationResponse.model_validate(get_tenant_location(db, location_id, context.tenant_id))


@router.get("/{location_id}/products", response_model=List[LocationProduct])
async def list_location_products(
    location_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Products that belong at this location (e.g. after scanning a shelf label)
    """
    get_tenant_location(db, location_id, context.tenant_id)
    rows = db.query(ProductLocation, Product).join(Product, Product.id == ProductLocation.product_id).filter(
        ProductLocation.location_id == location_id,
        ProductLocation.tenant_id == context.tenant_id,
        Product.status == "active"
    ).order_by(Product.product_name).all()

    return [LocationProduct(product_id=p.id, product_no=p.product_no, product_name=p.product_name,
                            role=link.role, is_primary=link.is_primary,
                            stock_quantity=p.stock_quantity or 0) for link, p in rows]


@router.post("", response_model=StoreLocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    location_data: StoreLocationCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new store location (admin only)
    """
    data = location_data.model_dump()
    data["rack_no"] = normalize_part(data["rack_no"], "Rack")
    if not data["rack_no"]:
        raise HTTPException(status_code=400, detail="Rack is required")
    data["shelf_no"] = normalize_part(data["shelf_no"], "Shelf")
    data["floor"] = data["floor"].strip()
    if not data["floor"]:
        raise HTTPException(status_code=400, detail="Floor is required")
    ensure_rack_matches_type(data["rack_no"], data["location_type"])
    existing_floor = rack_floor(db, context.tenant_id, data["rack_no"])
    if existing_floor and existing_floor != data["floor"]:
        raise HTTPException(status_code=400,
                            detail=f"Rack {data['rack_no']} is on floor {existing_floor}")
    data["location_code"] = StoreLocation.build_code(data["rack_no"], data["shelf_no"])
    ensure_code_unique(db, context.tenant_id, data["location_code"])

    location = StoreLocation(
        tenant_id=context.tenant_id,
        **data,
        created_by=context.user_id
    )
    db.add(location)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "store_location", location.id, new_value=snapshot(location))
    db.commit()

    return StoreLocationResponse.model_validate(get_tenant_location(db, location.id, context.tenant_id))


@router.put("/{location_id}", response_model=StoreLocationResponse)
async def update_location(
    location_id: int,
    location_data: StoreLocationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a store location (admin only)
    """
    location = get_tenant_location(db, location_id, context.tenant_id)
    update_data = location_data.model_dump(exclude_unset=True)

    for field in ("location_type", "floor", "rack_no", "status"):
        if field in update_data and update_data[field] is None:
            update_data.pop(field)
    if "rack_no" in update_data:
        update_data["rack_no"] = normalize_part(update_data["rack_no"], "Rack")
        if not update_data["rack_no"]:
            raise HTTPException(status_code=400, detail="Rack is required")
    if "shelf_no" in update_data:
        update_data["shelf_no"] = normalize_part(update_data["shelf_no"], "Shelf")
    if "floor" in update_data:
        update_data["floor"] = update_data["floor"].strip()
        if not update_data["floor"]:
            raise HTTPException(status_code=400, detail="Floor is required")

    location_type = update_data.get("location_type", location.location_type)
    rack_no = update_data.get("rack_no", location.rack_no)
    shelf_no = update_data.get("shelf_no", location.shelf_no)
    floor = update_data.get("floor", location.floor)
    if "rack_no" in update_data or "location_type" in update_data:
        ensure_rack_matches_type(rack_no, location_type)
    if "rack_no" in update_data and rack_no != location.rack_no:
        existing_floor = rack_floor(db, context.tenant_id, rack_no, exclude_id=location_id)
        if existing_floor and existing_floor != floor:
            raise HTTPException(status_code=400,
                                detail=f"Rack {rack_no} is on floor {existing_floor}")
    code = StoreLocation.build_code(rack_no, shelf_no)
    if code != location.location_code:
        ensure_code_unique(db, context.tenant_id, code, exclude_id=location_id)
    update_data["location_code"] = code

    old_value = snapshot(location)
    old_rack = location.rack_no
    for field, value in update_data.items():
        setattr(location, field, value)
    location.updated_by = context.user_id
    if "floor" in update_data and rack_no == old_rack:
        # Moving a rack moves all of its shelves
        db.query(StoreLocation).filter(
            StoreLocation.tenant_id == context.tenant_id,
            StoreLocation.rack_no == rack_no,
            StoreLocation.id != location_id
        ).update({StoreLocation.floor: floor, StoreLocation.updated_by: context.user_id},
                 synchronize_session=False)
    if "location_type" in update_data:
        sync_link_roles(db, location)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "store_location", location.id, old_value=old_value, new_value=snapshot(location))
    db.commit()

    return StoreLocationResponse.model_validate(get_tenant_location(db, location_id, context.tenant_id))


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Deactivate a store location (admin only). Existing product assignments are kept.
    """
    location = get_tenant_location(db, location_id, context.tenant_id)
    old_value = snapshot(location)
    location.status = "inactive"
    location.updated_by = context.user_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "store_location", location.id, old_value=old_value, new_value=snapshot(location))
    db.commit()
