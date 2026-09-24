"""
Authentication endpoints
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from app.core.audit import record_audit
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.tenant import Tenant
from app.schemas.auth import Token, LoginRequest
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    OAuth2 compatible token login
    """
    # Usernames are unique per tenant, so match the account whose password verifies
    candidates = db.query(User).filter(User.username == form_data.username).all()
    user = next(
        (u for u in candidates if verify_password(form_data.password, u.password_hash)),
        None
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Check if tenant is active
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant or tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant account is inactive"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    record_audit(db, request, user.tenant_id, user.id, AuditLog.ACTION_LOGIN, "user", user.id)
    db.commit()
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "user_id": user.id,
            "username": user.username,
            "tenant_id": user.tenant_id,
            "role": user.role.role_name
        },
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        username=user.username,
        role=user.role.role_name,
        tenant_id=user.tenant_id,
        tenant_name=tenant.tenant_name
    )


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout endpoint (client should discard token)
    """
    record_audit(db, request, current_user.tenant_id, current_user.id,
                 AuditLog.ACTION_LOGOUT, "user", current_user.id)
    db.commit()
    return {"message": "Successfully logged out"}


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user information
    """
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.role_name,
        "tenant_id": current_user.tenant_id,
        "tenant_name": tenant.tenant_name if tenant else None,
        "last_login": current_user.last_login
    }

