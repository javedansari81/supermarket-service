"""
Tenant management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantUpdate, TenantResponse, TenantListResponse
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("", response_model=TenantListResponse)
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin_user)
):
    """
    List tenants visible to the admin (own tenant only)
    """
    query = db.query(Tenant).filter(Tenant.id == current_user.tenant_id)
    
    if status:
        query = query.filter(Tenant.status == status)
    
    if search:
        query = query.filter(
            (Tenant.tenant_name.ilike(f"%{search}%")) |
            (Tenant.tenant_code.ilike(f"%{search}%"))
        )
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return TenantListResponse(
        items=[TenantResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/current", response_model=TenantResponse)
async def get_current_tenant(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get current user's tenant
    """
    tenant = db.query(Tenant).filter(Tenant.id == context.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin_user)
):
    """
    Get tenant by ID (admin only, own tenant)
    """
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.id == current_user.tenant_id
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_data: TenantCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new tenant (admin only)
    """
    # Check if tenant code already exists
    existing = db.query(Tenant).filter(Tenant.tenant_code == tenant_data.tenant_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant code already exists")
    
    tenant = Tenant(**tenant_data.model_dump())
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    
    return TenantResponse.model_validate(tenant)


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant_data: TenantUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a tenant (admin only, own tenant)
    """
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id,
        Tenant.id == current_user.tenant_id
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = tenant_data.model_dump(exclude_unset=True)
    if update_data.get("status", tenant.status) != "active":
        raise HTTPException(status_code=400, detail="You cannot deactivate your own tenant")
    for field, value in update_data.items():
        setattr(tenant, field, value)
    
    db.commit()
    db.refresh(tenant)
    
    return TenantResponse.model_validate(tenant)

