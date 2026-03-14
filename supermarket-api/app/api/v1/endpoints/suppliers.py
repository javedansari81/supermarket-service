"""
Supplier management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


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
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new supplier (admin only)
    """
    # Check if supplier code already exists
    existing = db.query(Supplier).filter(
        Supplier.tenant_id == context.tenant_id,
        Supplier.supplier_code == supplier_data.supplier_code
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Supplier code already exists")
    
    supplier = Supplier(
        tenant_id=context.tenant_id,
        **supplier_data.model_dump(),
        created_by=context.user_id
    )
    
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    
    return SupplierResponse.model_validate(supplier)


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: int,
    supplier_data: SupplierUpdate,
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
    for field, value in update_data.items():
        setattr(supplier, field, value)
    
    supplier.updated_by = context.user_id
    db.commit()
    db.refresh(supplier)
    
    return SupplierResponse.model_validate(supplier)

