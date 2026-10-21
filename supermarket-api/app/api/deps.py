"""
API dependencies for authentication and authorization
"""
from typing import Generator, Optional
from urllib.parse import urlparse
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.models.tenant import Tenant

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _request_hostname(request: Request) -> str:
    """Host name of the site the request came from (Origin when the UI calls the API cross-site)"""
    origin = request.headers.get("origin")
    hostname = urlparse(origin).hostname if origin else None
    if not hostname:
        raw = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        hostname = raw.split(",")[0].strip().split(":")[0]
    return hostname.lower()


def get_store_tenant_id(request: Request, db: Session) -> Optional[int]:
    """
    Tenant ID of the store subdomain the request came from.
    None when the request is not from a store subdomain (no restriction applies).
    """
    base_domain = settings.BASE_DOMAIN.strip().lower()
    if not base_domain:
        return None
    suffix = "." + base_domain
    hostname = _request_hostname(request)
    if not hostname.endswith(suffix):
        return None
    subdomain = hostname[:-len(suffix)]
    tenant = db.query(Tenant.id).filter(Tenant.subdomain == subdomain).first()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    return tenant.id


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    Get the current authenticated user from JWT token
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id: int = payload.get("user_id")
    if user_id is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    if user.tenant is None or user.tenant.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant account is inactive"
        )

    store_tenant_id = get_store_tenant_id(request, db)
    if store_tenant_id is not None and store_tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not belong to this store"
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current active user
    """
    if current_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current user and verify admin role
    """
    if current_user.role.role_name != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def get_current_supervisor_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current user and verify admin or supervisor role
    """
    if current_user.role.role_name not in ("admin", "supervisor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor access required"
        )
    return current_user


def get_tenant_id(current_user: User = Depends(get_current_user)) -> int:
    """
    Get tenant ID from current user
    """
    return current_user.tenant_id


class TenantContext:
    """
    Context class for tenant-scoped operations
    """
    def __init__(self, tenant_id: int, user_id: int, role: str):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.role = role
        self.is_admin = role == "admin"
        self.is_supervisor = role == "supervisor"


def get_tenant_context(
    current_user: User = Depends(get_current_user)
) -> TenantContext:
    """
    Get tenant context for current user
    """
    return TenantContext(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        role=current_user.role.role_name
    )

