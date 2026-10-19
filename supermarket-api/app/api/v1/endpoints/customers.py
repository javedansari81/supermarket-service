"""
Customer endpoints (customer history by mobile number)
"""
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_
from app.core.database import get_db
from app.core.audit import record_audit
from app.core.loyalty import (
    get_loyalty_settings, lock_customer, expire_if_due, post_points,
    effective_balance, expires_at, points_value,
)
from app.models.audit_log import AuditLog
from app.models.customer import Customer
from app.models.loyalty_transaction import LoyaltyTransaction
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn
from app.models.invoice import Invoice
from app.models.user import User
from app.schemas.customer import (
    CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerSaleRow, CustomerSalesResponse, normalize_mobile,
    LoyaltyTransactionResponse, LoyaltyHistoryResponse, LoyaltyAdjustRequest,
)
from app.schemas.settings import LoyaltySettings
from app.api.deps import get_tenant_context, get_current_admin_user, TenantContext

router = APIRouter()


def upsert_customer_for_sale(db: Session, tenant_id: int, mobile: str,
                             name: Optional[str], gstin: Optional[str]) -> Customer:
    """Find the customer for a mobile number, creating it if new; keep the latest name/GSTIN"""
    customer = db.query(Customer).filter(
        Customer.tenant_id == tenant_id, Customer.mobile == mobile
    ).first()
    if not customer:
        try:
            with db.begin_nested():
                customer = Customer(tenant_id=tenant_id, mobile=mobile,
                                    customer_name=name, customer_gstin=gstin)
                db.add(customer)
        except IntegrityError:
            customer = db.query(Customer).filter(
                Customer.tenant_id == tenant_id, Customer.mobile == mobile
            ).one()
    if name:
        customer.customer_name = name
    if gstin:
        customer.customer_gstin = gstin
    if customer.status != "active":
        customer.status = "active"
    return customer


def _stats_subquery(db: Session, tenant_id: int):
    returned = db.query(
        SaleReturn.sale_id.label("sale_id"),
        func.sum(SaleReturn.total_amount).label("returned"),
    ).filter(SaleReturn.tenant_id == tenant_id).group_by(SaleReturn.sale_id).subquery()
    return db.query(
        Sale.customer_id.label("customer_id"),
        func.count(Sale.id).label("visits"),
        func.coalesce(
            func.sum(Sale.total_amount - func.coalesce(returned.c.returned, 0)), 0
        ).label("total_spent"),
        func.min(Sale.sale_date).label("first_visit"),
        func.max(Sale.sale_date).label("last_visit"),
    ).outerjoin(returned, returned.c.sale_id == Sale.id).filter(
        Sale.tenant_id == tenant_id,
        Sale.customer_id.isnot(None),
        Sale.status.in_(("completed", "refunded")),
    ).group_by(Sale.customer_id).subquery()


def _customer_query(db: Session, tenant_id: int):
    stats = _stats_subquery(db, tenant_id)
    query = db.query(
        Customer,
        func.coalesce(stats.c.visits, 0),
        func.coalesce(stats.c.total_spent, 0),
        stats.c.first_visit,
        stats.c.last_visit,
    ).outerjoin(stats, stats.c.customer_id == Customer.id).filter(Customer.tenant_id == tenant_id)
    return query, stats


def _to_response(row, settings: LoyaltySettings) -> CustomerResponse:
    customer, visits, total_spent, first_visit, last_visit = row
    response = CustomerResponse.model_validate(customer)
    response.visits = visits
    response.total_spent = total_spent
    response.first_visit = first_visit
    response.last_visit = last_visit
    response.points_balance = effective_balance(customer, settings)
    response.points_value = points_value(response.points_balance, settings)
    response.points_expires_at = expires_at(customer, settings) if response.points_balance else None
    return response


def _get_customer_row(db: Session, tenant_id: int, customer_id: int):
    query, _ = _customer_query(db, tenant_id)
    row = query.filter(Customer.id == customer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return row


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """List customers with visit count and total spent"""
    query, stats = _customer_query(db, context.tenant_id)
    term = (search or "").strip()
    if term:
        digits = re.sub(r"[^0-9]", "", term)
        conditions = [Customer.customer_name.ilike(f"%{term}%")]
        if digits:
            conditions.append(Customer.mobile.like(f"%{digits[-10:]}%"))
        query = query.filter(or_(*conditions))

    total = query.count()
    rows = query.order_by(stats.c.last_visit.desc().nullslast(), Customer.id.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()
    settings = get_loyalty_settings(db, context.tenant_id)
    return CustomerListResponse(items=[_to_response(r, settings) for r in rows], total=total,
                                page=page, page_size=page_size)


@router.get("/lookup", response_model=CustomerResponse)
async def lookup_customer(
    mobile: str,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Find a customer by mobile number (used at checkout)"""
    try:
        normalized = normalize_mobile(mobile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not normalized:
        raise HTTPException(status_code=400, detail="Mobile number is required")
    query, _ = _customer_query(db, context.tenant_id)
    row = query.filter(Customer.mobile == normalized).first()
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _to_response(row, get_loyalty_settings(db, context.tenant_id))


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Get a customer with purchase summary"""
    return _to_response(_get_customer_row(db, context.tenant_id, customer_id),
                        get_loyalty_settings(db, context.tenant_id))


def _loyalty_history(db: Session, tenant_id: int, customer: Customer, settings: LoyaltySettings,
                     page: int, page_size: int) -> LoyaltyHistoryResponse:
    query = db.query(LoyaltyTransaction, Sale.sale_no, SaleReturn.return_no, User.full_name) \
        .outerjoin(Sale, Sale.id == LoyaltyTransaction.sale_id) \
        .outerjoin(SaleReturn, SaleReturn.id == LoyaltyTransaction.return_id) \
        .outerjoin(User, User.id == LoyaltyTransaction.created_by) \
        .filter(LoyaltyTransaction.tenant_id == tenant_id,
                LoyaltyTransaction.customer_id == customer.id)
    total = query.count()
    rows = query.order_by(LoyaltyTransaction.id.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for txn, sale_no, return_no, user_name in rows:
        item = LoyaltyTransactionResponse.model_validate(txn)
        item.sale_no = sale_no
        item.return_no = return_no
        item.created_by_name = user_name
        items.append(item)
    balance = effective_balance(customer, settings)
    return LoyaltyHistoryResponse(
        points_balance=balance, points_value=points_value(balance, settings),
        points_expires_at=expires_at(customer, settings) if balance else None,
        items=items, total=total, page=page, page_size=page_size)


@router.get("/{customer_id}/loyalty", response_model=LoyaltyHistoryResponse)
async def get_customer_loyalty(
    customer_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """A customer's points balance and points history, newest first"""
    customer = db.query(Customer).filter(
        Customer.id == customer_id, Customer.tenant_id == context.tenant_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _loyalty_history(db, context.tenant_id, customer,
                            get_loyalty_settings(db, context.tenant_id), page, page_size)


@router.post("/{customer_id}/loyalty/adjust", response_model=LoyaltyHistoryResponse)
async def adjust_customer_loyalty(
    customer_id: int,
    data: LoyaltyAdjustRequest,
    request: Request,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """Manually add or remove a customer's points (admin only, audited)"""
    customer = lock_customer(db, context.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    settings = get_loyalty_settings(db, context.tenant_id)
    expire_if_due(db, customer, settings, context.user_id)
    old_balance = customer.points_balance or 0
    txn = post_points(db, customer, LoyaltyTransaction.TYPE_ADJUST, data.points, context.user_id,
                      remarks=data.remarks, touch=data.points > 0)
    db.flush()
    record_audit(db, request, context.tenant_id, context.user_id, AuditLog.ACTION_UPDATE,
                 "customer_points", entity_id=customer.id,
                 old_value={"points_balance": old_balance},
                 new_value={"points_balance": customer.points_balance, "points": data.points,
                            "remarks": data.remarks, "loyalty_transaction_id": txn.id})
    db.commit()
    return _loyalty_history(db, context.tenant_id, customer, settings, 1, 10)


@router.get("/{customer_id}/sales", response_model=CustomerSalesResponse)
async def list_customer_sales(
    customer_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """List a customer's past bills, newest first"""
    _get_customer_row(db, context.tenant_id, customer_id)
    item_counts = db.query(
        SaleItem.sale_id.label("sale_id"), func.count(SaleItem.id).label("item_count")
    ).group_by(SaleItem.sale_id).subquery()
    query = db.query(
        Sale, Invoice.id, Invoice.invoice_no, func.coalesce(item_counts.c.item_count, 0)
    ).outerjoin(Invoice, Invoice.sale_id == Sale.id) \
        .outerjoin(item_counts, item_counts.c.sale_id == Sale.id) \
        .filter(Sale.tenant_id == context.tenant_id, Sale.customer_id == customer_id)

    total = query.count()
    rows = query.order_by(Sale.sale_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = [
        CustomerSaleRow(
            sale_id=sale.id, sale_no=sale.sale_no, sale_date=sale.sale_date,
            invoice_id=invoice_id, invoice_no=invoice_no, item_count=item_count,
            total_amount=sale.total_amount or 0, payment_mode=sale.payment_mode, status=sale.status,
        )
        for sale, invoice_id, invoice_no, item_count in rows
    ]
    return CustomerSalesResponse(items=items, total=total, page=page, page_size=page_size)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """Update a customer's name, GSTIN or status (mobile number is fixed)"""
    customer = db.query(Customer).filter(
        Customer.id == customer_id, Customer.tenant_id == context.tenant_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value is None:
            continue
        setattr(customer, field, value)
    db.commit()
    return _to_response(_get_customer_row(db, context.tenant_id, customer_id),
                        get_loyalty_settings(db, context.tenant_id))
