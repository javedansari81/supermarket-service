"""
Customer login for online ordering: mobile OTP only, no password and no separate signup.
One login (CustomerAccount) works at every store. Each store keeps its own Customer row for
the same mobile number (name on invoices, loyalty points, orders); it already exists when the
customer was billed in-store, otherwise it is created at the first order at that store.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core import otp
from app.core.audit import client_ip
from app.core.config import settings
from app.core.database import get_db
from app.core.loyalty import get_loyalty_settings, effective_balance
from app.core.security import create_access_token
from app.models.customer import Customer
from app.models.customer_auth import CustomerAccount, CustomerOtp, CustomerRefreshToken
from app.models.tenant import Tenant
from app.schemas.customer_auth import (
    OtpRequest, OtpRequestResponse, OtpVerify, RefreshRequest,
    CustomerToken, AccountResponse, AccountUpdate, MyStore, MyStoresResponse,
)
from app.api.deps import CUSTOMER_TOKEN_TYPE, get_current_account, limit_by_ip, online_store_ids
from app.api.v1.endpoints.settings import build_store_settings

router = APIRouter()
logger = logging.getLogger("app.customer_auth")

DISABLED_DETAIL = "This account is disabled"


def _too_many(detail: str, retry_after: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail,
                         headers={"Retry-After": str(max(retry_after, 1))})


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _issue_tokens(db: Session, request: Request, account: CustomerAccount) -> CustomerToken:
    access_minutes = settings.CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES
    refresh_days = settings.CUSTOMER_REFRESH_TOKEN_EXPIRE_DAYS
    access_token = create_access_token(
        {"type": CUSTOMER_TOKEN_TYPE, "account_id": account.id},
        expires_delta=timedelta(minutes=access_minutes)
    )
    refresh_token = secrets.token_urlsafe(32)
    db.add(CustomerRefreshToken(
        account_id=account.id, token_hash=_token_hash(refresh_token),
        expires_at=datetime.utcnow() + timedelta(days=refresh_days),
        user_agent=request.headers.get("user-agent"),
    ))
    return CustomerToken(
        access_token=access_token, refresh_token=refresh_token,
        expires_in=access_minutes * 60, refresh_expires_in=refresh_days * 86400,
        needs_name=not account.customer_name, account=AccountResponse.model_validate(account),
    )


def _find_or_create_account(db: Session, mobile: str) -> CustomerAccount:
    """The login for a mobile number; a new one takes the name the stores already have"""
    query = db.query(CustomerAccount).filter(CustomerAccount.mobile == mobile)
    account = query.first()
    if account:
        return account
    known_name = db.query(Customer.customer_name).filter(
        Customer.mobile == mobile, Customer.customer_name.isnot(None)
    ).order_by(Customer.updated_at.desc()).limit(1).scalar()
    try:
        with db.begin_nested():
            account = CustomerAccount(mobile=mobile, customer_name=known_name)
            db.add(account)
    except IntegrityError:
        account = query.one()
    return account


@router.post("/otp/request", response_model=OtpRequestResponse,
             dependencies=[Depends(limit_by_ip("otp-request", "RATE_LIMIT_OTP_REQUEST_PER_MINUTE"))])
async def request_otp(data: OtpRequest, request: Request, db: Session = Depends(get_db)):
    """Send a 6-digit login code by SMS"""
    if not otp.otp_enabled():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Online login is not available right now")
    now = datetime.utcnow()
    hour_ago = now - timedelta(hours=1)
    ip_address = client_ip(request)

    last = db.query(CustomerOtp).filter(CustomerOtp.mobile == data.mobile
                                        ).order_by(CustomerOtp.created_at.desc()).first()
    if last:
        wait = settings.OTP_RESEND_SECONDS - int((now - last.created_at).total_seconds())
        if wait > 0:
            raise _too_many(f"Please wait {wait} seconds before asking for a new code", wait)
    sent_to_mobile = db.query(func.count(CustomerOtp.id)).filter(
        CustomerOtp.mobile == data.mobile, CustomerOtp.created_at > hour_ago).scalar()
    if sent_to_mobile >= settings.OTP_MAX_PER_MOBILE_PER_HOUR:
        raise _too_many("Too many codes requested for this number. Try again later.", 3600)
    if ip_address:
        sent_from_ip = db.query(func.count(CustomerOtp.id)).filter(
            CustomerOtp.ip_address == ip_address, CustomerOtp.created_at > hour_ago).scalar()
        if sent_from_ip >= settings.OTP_MAX_PER_IP_PER_HOUR:
            raise _too_many("Too many codes requested. Try again later.", 3600)

    code = otp.generate_code()
    db.add(CustomerOtp(mobile=data.mobile, code_hash=otp.hash_code(data.mobile, code),
                       expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
                       ip_address=ip_address, created_at=now))
    db.flush()
    otp.send_otp(data.mobile, code)
    db.commit()
    return OtpRequestResponse(message="Code sent", expires_in=settings.OTP_EXPIRE_MINUTES * 60,
                              resend_in=settings.OTP_RESEND_SECONDS)


@router.post("/otp/verify", response_model=CustomerToken,
             dependencies=[Depends(limit_by_ip("otp-verify", "RATE_LIMIT_OTP_VERIFY_PER_MINUTE"))])
async def verify_otp(data: OtpVerify, request: Request, db: Session = Depends(get_db)):
    """Log in with the code; the first login creates the account (no store record yet)"""
    now = datetime.utcnow()
    record = db.query(CustomerOtp).filter(CustomerOtp.mobile == data.mobile
                                          ).order_by(CustomerOtp.created_at.desc()
                                                     ).with_for_update().first()
    if not record or record.consumed_at or record.expires_at < now:
        raise HTTPException(status_code=400, detail="Code expired. Please request a new code.")
    if record.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise _too_many("Too many wrong attempts. Please request a new code.",
                        settings.OTP_RESEND_SECONDS)
    if not otp.code_matches(data.mobile, data.code, record.code_hash):
        record.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect code")

    record.consumed_at = now
    account = _find_or_create_account(db, data.mobile)
    if account.status != "active":
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=DISABLED_DETAIL)
    account.last_login = now
    token = _issue_tokens(db, request, account)
    db.commit()
    logger.info("Customer account %s logged in", account.id)
    return token


@router.post("/refresh", response_model=CustomerToken,
             dependencies=[Depends(limit_by_ip("refresh", "RATE_LIMIT_REFRESH_PER_MINUTE"))])
async def refresh(data: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Swap a refresh token for a new access and refresh token (the old one stops working)"""
    expired = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please log in again")
    stored = db.query(CustomerRefreshToken).filter(
        CustomerRefreshToken.token_hash == _token_hash(data.refresh_token)
    ).with_for_update().first()
    if not stored:
        raise expired
    now = datetime.utcnow()
    if stored.revoked_at:
        # A used token came back: it may be stolen, so end every session of this account
        db.query(CustomerRefreshToken).filter(
            CustomerRefreshToken.account_id == stored.account_id,
            CustomerRefreshToken.revoked_at.is_(None)
        ).update({CustomerRefreshToken.revoked_at: now}, synchronize_session=False)
        db.commit()
        logger.warning("Reused refresh token for customer account %s; all sessions ended",
                       stored.account_id)
        raise expired
    if stored.expires_at < now:
        raise expired
    account = db.query(CustomerAccount).filter(CustomerAccount.id == stored.account_id).first()
    if account.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=DISABLED_DETAIL)
    stored.revoked_at = now
    token = _issue_tokens(db, request, account)
    db.commit()
    return token


@router.post("/logout")
async def logout(data: RefreshRequest, db: Session = Depends(get_db)):
    """End this session; works even after the access token has expired"""
    stored = db.query(CustomerRefreshToken).filter(
        CustomerRefreshToken.token_hash == _token_hash(data.refresh_token),
        CustomerRefreshToken.revoked_at.is_(None)
    ).first()
    if stored:
        stored.revoked_at = datetime.utcnow()
        db.commit()
    return {"message": "Logged out"}


@router.get("/me", response_model=AccountResponse)
async def get_me(account: CustomerAccount = Depends(get_current_account)):
    """The logged-in customer's profile"""
    return account


@router.put("/me", response_model=AccountResponse)
async def update_me(data: AccountUpdate, db: Session = Depends(get_db),
                    account: CustomerAccount = Depends(get_current_account)):
    """Set the customer's name (asked after the first login); stores without a name get it too"""
    account.customer_name = data.customer_name
    db.query(Customer).filter(Customer.mobile == account.mobile, Customer.customer_name.is_(None)
                              ).update({Customer.customer_name: data.customer_name},
                                       synchronize_session=False)
    db.commit()
    db.refresh(account)
    return account


@router.get("/my-stores", response_model=MyStoresResponse)
async def my_stores(db: Session = Depends(get_db),
                    account: CustomerAccount = Depends(get_current_account)):
    """Stores selling online where the customer already has a record, shown first in the
    store picker. Other stores never learn about these."""
    rows = db.query(Customer, Tenant).join(Tenant, Tenant.id == Customer.tenant_id).filter(
        Customer.mobile == account.mobile, Customer.status == "active",
        Tenant.status == "active", Tenant.subdomain.isnot(None),
        Tenant.id.in_(online_store_ids(db))
    ).order_by(Tenant.tenant_name).all()
    items = []
    for customer, tenant in rows:
        loyalty = get_loyalty_settings(db, tenant.id)
        items.append(MyStore(
            store=tenant.subdomain, store_name=build_store_settings(db, tenant.id).store_name,
            points_balance=effective_balance(customer, loyalty) if loyalty.enabled else 0,
        ))
    return MyStoresResponse(items=items)
