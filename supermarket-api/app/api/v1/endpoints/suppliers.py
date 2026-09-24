"""
Supplier management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy import func, cast, Integer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


def generate_supplier_code(db: Session, tenant_id: int) -> str:
    """Generate next sequential supplier code (SUP0001, SUP0002, ...)"""
    last_seq = db.query(
        func.max(cast(func.substring(Supplier.supplier_code, 4), Integer))
    ).filter(
        Supplier.tenant_id == tenant_id,
        Supplier.supplier_code.op("~")("^SUP[0-9]+$")
    ).scalar() or 0
    return f"SUP{last_seq + 1:04d}"


def ensure_unique_gst_no(db: Session, tenant_id: int, gst_no: Optional[str], exclude_id: int = 0):
    """Reject a GSTIN already used by another supplier"""
    if not gst_no:
        return
    duplicate = db.query(Supplier).filter(
        Supplier.tenant_id == tenant_id,
        Supplier.gst_no == gst_no,
        Supplier.id != exclude_id
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"GSTIN already used by supplier {duplicate.supplier_name}"
        )


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List suppliers for current tenant
    """
    query = db.query(Supplier).filter(Supplier.tenant_id == context.tenant_id)
    
    if status:
        query = query.filter(Supplier.status == status)
    
    if search:
        query = query.filter(
            (Supplier.supplier_name.ilike(f"%{search}%")) |
            (Supplier.supplier_code.ilike(f"%{search}%"))
        )
    
    total = query.count()
    items = query.order_by(Supplier.supplier_name).offset((page - 1) * page_size).limit(page_size).all()
    
    return SupplierListResponse(
        items=[SupplierResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/active")
async def list_active_suppliers(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    List active suppliers (for dropdowns)
    """
    suppliers = db.query(Supplier).filter(
        Supplier.tenant_id == context.tenant_id,
        Supplier.status == "active"
    ).order_by(Supplier.supplier_name).all()
    
    return [{"id": s.id, "supplier_code": s.supplier_code, "supplier_name": s.supplier_name} for s in suppliers]


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get supplier by ID
    """
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id,
        Supplier.tenant_id == context.tenant_id
    ).first()
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    return SupplierResponse.model_validate(supplier)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    supplier_data: SupplierCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new supplier (admin only)
    """
    data = supplier_data.model_dump()
    data["supplier_code"] = (data.get("supplier_code") or "").strip().upper() \
        or generate_supplier_code(db, context.tenant_id)

    # Check if supplier code already exists
    existing = db.query(Supplier).filter(
        Supplier.tenant_id == context.tenant_id,
        Supplier.supplier_code == data["supplier_code"]
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Supplier code already exists")

    ensure_unique_gst_no(db, context.tenant_id, data.get("gst_no"))

    supplier = Supplier(
        tenant_id=context.tenant_id,
        **data,
        created_by=context.user_id
    )
    
    db.add(supplier)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "supplier", supplier.id, new_value=snapshot(supplier))
    db.commit()
    db.refresh(supplier)

    return SupplierResponse.model_validate(supplier)


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: int,
    supplier_data: SupplierUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a supplier (admin only)
    """
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id,
        Supplier.tenant_id == context.tenant_id
    ).first()
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    update_data = supplier_data.model_dump(exclude_unset=True)
    if "gst_no" in update_data:
        ensure_unique_gst_no(db, context.tenant_id, update_data["gst_no"], supplier.id)
    old_value = snapshot(supplier)
    for field, value in update_data.items():
        setattr(supplier, field, value)

    supplier.updated_by = context.user_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "supplier", supplier.id, old_value=old_value, new_value=snapshot(supplier))
    db.commit()
    db.refresh(supplier)

    return SupplierResponse.model_validate(supplier)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Deactivate a supplier (admin only). Soft delete keeps purchase history intact.
    """
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id,
        Supplier.tenant_id == context.tenant_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    old_value = snapshot(supplier)
    supplier.status = "inactive"
    supplier.updated_by = context.user_id
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "supplier", supplier.id, old_value=old_value, new_value=snapshot(supplier))
    db.commit()

