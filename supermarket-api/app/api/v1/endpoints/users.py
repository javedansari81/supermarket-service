"""
User management endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import get_password_hash
from app.core.audit import record_audit, snapshot
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.role import Role
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse
from app.schemas.auth import PasswordReset
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    role_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    List users for current tenant (admin only)
    """
    query = db.query(User).options(joinedload(User.role)).filter(
        User.tenant_id == context.tenant_id
    )

    if status:
        query = query.filter(User.status == status)

    if role_id:
        query = query.filter(User.role_id == role_id)

    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.full_name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%"))
        )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return UserListResponse(
        items=[UserResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/roles")
async def list_roles(db: Session = Depends(get_db)):
    """
    List all available roles
    """
    roles = db.query(Role).all()
    return [{"id": r.id, "role_name": r.role_name, "description": r.description} for r in roles]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get user by ID (admin only)
    """
    user = db.query(User).options(joinedload(User.role)).filter(
        User.id == user_id,
        User.tenant_id == context.tenant_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse.model_validate(user)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Create a new user (admin only)
    """
    # Check if username already exists for this tenant
    existing = db.query(User).filter(
        User.tenant_id == context.tenant_id,
        User.username == user_data.username
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Verify role exists
    role = db.query(Role).filter(Role.id == user_data.role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = User(
        tenant_id=context.tenant_id,
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        contact_no=user_data.contact_no,
        role_id=user_data.role_id,
        created_by=context.user_id
    )

    db.add(user)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_CREATE,
                 "user", user.id, new_value=snapshot(user))
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Update a user (admin only)
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == context.tenant_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_data.model_dump(exclude_unset=True)

    if "role_id" in update_data and update_data["role_id"] != user.role_id:
        if not db.query(Role).filter(Role.id == update_data["role_id"]).first():
            raise HTTPException(status_code=400, detail="Invalid role")
        if user.id == context.user_id:
            raise HTTPException(status_code=400, detail="You cannot change your own role")

    if user.id == context.user_id and update_data.get("status", user.status) != "active":
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    old_value = snapshot(user)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "user", user.id, old_value=old_value, new_value=snapshot(user))
    db.commit()
    db.refresh(user)

    return UserResponse.model_validate(user)


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Reset user password (admin only)
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == context.tenant_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = get_password_hash(password_data.new_password)
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "user", user.id, new_value={"password_reset": True})
    db.commit()

    return {"message": "Password reset successfully"}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Deactivate a user (admin only). Soft delete keeps sales/audit history intact.
    """
    if user_id == context.user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == context.tenant_id
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_value = snapshot(user)
    user.status = "inactive"
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_DELETE,
                 "user", user.id, old_value=old_value, new_value=snapshot(user))
    db.commit()

