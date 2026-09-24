"""
Reports endpoints
"""
from typing import Optional
from datetime import datetime, date, time, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, union_all
from app.core.database import get_db
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn, SaleReturnItem
from app.models.product import Product
from app.models.purchase import Purchase
from app.models.category import Category
from app.models.stock_movement import StockMovement
from app.models.user import User
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()

# India Standard Time (no daylight saving)
IST_OFFSET = timedelta(hours=5, minutes=30)
IST = timezone(IST_OFFSET)

# Sales that count as billed; voided sales are 'cancelled'. Returns are subtracted separately.
BILLED_STATUSES = ("completed", "refunded")


def ist_day_start_utc(day: date) -> datetime:
    """Start of an IST calendar day as a naive UTC datetime (how sale_date is stored)"""
    return datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)


def validate_date_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="From date cannot be after to date")


def pct_change(current: float, previous: float) -> Optional[float]:
    """Percentage change from previous to current; None when there is no baseline"""
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def net_product_lines(db: Session, tenant_id: int, from_date: date, to_date: date):
    """Sold lines (by sale date) minus returned lines (by return date) as one subquery"""
    sold = db.query(
        SaleItem.product_id.label("product_id"),
        SaleItem.product_name.label("product_name"),
        SaleItem.quantity.label("quantity"),
        SaleItem.line_total.label("amount")
    ).join(Sale).filter(
        Sale.tenant_id == tenant_id,
        func.date(Sale.sale_date) >= from_date,
        func.date(Sale.sale_date) <= to_date,
        Sale.status.in_(BILLED_STATUSES)
    )
    returned = db.query(
        SaleReturnItem.product_id,
        SaleReturnItem.product_name,
        -SaleReturnItem.quantity,
        -SaleReturnItem.line_total
    ).join(SaleReturn).filter(
        SaleReturn.tenant_id == tenant_id,
        func.date(SaleReturn.return_date) >= from_date,
        func.date(SaleReturn.return_date) <= to_date
    )
    return union_all(sold, returned).subquery()


@router.get("/dashboard")
async def get_dashboard(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get dashboard summary data.
    Admins see store-wide figures; other users see sales they billed themselves.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today = datetime.now(IST).date()
    today_start = ist_day_start_utc(today)
    tomorrow_start = ist_day_start_utc(today + timedelta(days=1))
    month_start = ist_day_start_utc(today.replace(day=1))
    prev_month_start = ist_day_start_utc((today.replace(day=1) - timedelta(days=1)).replace(day=1))
    trend_start = today_start - timedelta(days=6)
    ist_sale_date = Sale.sale_date + IST_OFFSET

    def sales_filter(start, end, statuses=BILLED_STATUSES):
        conditions = [
            Sale.tenant_id == context.tenant_id,
            Sale.sale_date >= start,
            Sale.sale_date < end,
            Sale.status.in_(statuses)
        ]
        if not context.is_admin:
            conditions.append(Sale.created_by == context.user_id)
        return conditions

    def returns_filter(start, end):
        conditions = [
            SaleReturn.tenant_id == context.tenant_id,
            SaleReturn.return_date >= start,
            SaleReturn.return_date < end
        ]
        if not context.is_admin:
            conditions.append(SaleReturn.created_by == context.user_id)
        return conditions

    def returns_totals(start, end):
        total, count, discount = db.query(
            func.coalesce(func.sum(SaleReturn.total_amount), 0),
            func.count(SaleReturn.id),
            func.coalesce(func.sum(SaleReturn.discount_amount), 0)
        ).filter(*returns_filter(start, end)).one()
        return float(total or 0), int(count or 0), float(discount or 0)

    def sales_totals(start, end):
        """Net sales (billed minus returns), bill count and net discount"""
        total, count, discount = db.query(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.discount_amount), 0)
        ).filter(*sales_filter(start, end)).one()
        returned, _, returned_discount = returns_totals(start, end)
        return float(total or 0) - returned, int(count or 0), float(discount or 0) - returned_discount

    today_sales, today_transactions, today_discount = sales_totals(today_start, tomorrow_start)
    returns_today_amount, returns_today_count, _ = returns_totals(today_start, tomorrow_start)
    # Comparisons use the same elapsed time of day so a partial day is not compared to a full day
    yesterday_sales, _, _ = sales_totals(today_start - timedelta(days=1), now_utc - timedelta(days=1))
    last_week_sales, _, _ = sales_totals(today_start - timedelta(days=7), now_utc - timedelta(days=7))
    mtd_sales, mtd_transactions, _ = sales_totals(month_start, tomorrow_start)
    prev_mtd_sales, _, _ = sales_totals(
        prev_month_start, min(prev_month_start + (now_utc - month_start), month_start)
    )

    today_line_items = db.query(func.count(SaleItem.id)).join(Sale).filter(
        *sales_filter(today_start, tomorrow_start)
    ).scalar() or 0

    cancelled_count, cancelled_amount = db.query(
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(*sales_filter(today_start, tomorrow_start, ("cancelled",))).one()

    payment_rows = db.query(
        Sale.payment_mode,
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(*sales_filter(today_start, tomorrow_start)).group_by(Sale.payment_mode).all()

    hour_col = func.extract("hour", ist_sale_date)
    hourly_rows = db.query(
        hour_col,
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(*sales_filter(today_start, tomorrow_start)).group_by(hour_col).all()
    hourly_map = {int(h): (int(c), float(s)) for h, c, s in hourly_rows}

    day_col = func.date(ist_sale_date)
    daily_rows = db.query(
        day_col,
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(*sales_filter(trend_start, tomorrow_start)).group_by(day_col).all()
    daily_map = {str(d): (int(c), float(s)) for d, c, s in daily_rows}

    top_rows = db.query(
        SaleItem.product_id,
        SaleItem.product_name,
        func.sum(SaleItem.quantity).label("quantity"),
        func.sum(SaleItem.line_total).label("revenue")
    ).join(Sale).filter(
        *sales_filter(today_start, tomorrow_start)
    ).group_by(
        SaleItem.product_id, SaleItem.product_name
    ).order_by(func.sum(SaleItem.line_total).desc()).limit(5).all()

    today_customer_ids = [row[0] for row in db.query(Sale.customer_id).filter(
        *sales_filter(today_start, tomorrow_start),
        Sale.customer_id.isnot(None)
    ).all()]
    unique_customer_ids = set(today_customer_ids)
    repeat_customers = 0
    if unique_customer_ids:
        repeat_customers = db.query(func.count(func.distinct(Sale.customer_id))).filter(
            Sale.tenant_id == context.tenant_id,
            Sale.status.in_(BILLED_STATUSES),
            Sale.sale_date < today_start,
            Sale.customer_id.in_(unique_customer_ids)
        ).scalar() or 0

    # Low stock count
    low_stock_count = db.query(
        func.count(Product.id)
    ).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active",
        Product.stock_quantity <= Product.reorder_level,
        Product.stock_quantity > 0
    ).scalar()
    
    # Out of stock count
    out_of_stock_count = db.query(
        func.count(Product.id)
    ).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active",
        Product.stock_quantity <= 0
    ).scalar()
    
    # Total products
    total_products = db.query(
        func.count(Product.id)
    ).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active"
    ).scalar()
    
    # Total categories
    total_categories = db.query(
        func.count(Category.id)
    ).filter(
        Category.tenant_id == context.tenant_id,
        Category.status == "active"
    ).scalar()
    
    admin_data = None
    if context.is_admin:
        revenue_ex_tax, cost_of_goods = db.query(
            func.coalesce(func.sum(SaleItem.taxable_value), 0),
            func.coalesce(func.sum(SaleItem.quantity * Product.purchase_price), 0)
        ).join(Sale, SaleItem.sale_id == Sale.id).join(
            Product, SaleItem.product_id == Product.id
        ).filter(
            *sales_filter(today_start, tomorrow_start),
            Product.purchase_price.isnot(None)
        ).one()
        returned_ex_tax, returned_cost = db.query(
            func.coalesce(func.sum(SaleReturnItem.taxable_value), 0),
            func.coalesce(func.sum(SaleReturnItem.quantity * Product.purchase_price), 0)
        ).join(SaleReturn, SaleReturnItem.return_id == SaleReturn.id).join(
            Product, SaleReturnItem.product_id == Product.id
        ).filter(
            *returns_filter(today_start, tomorrow_start),
            Product.purchase_price.isnot(None)
        ).one()
        revenue_ex_tax = float(revenue_ex_tax or 0) - float(returned_ex_tax or 0)
        gross_margin = revenue_ex_tax - (float(cost_of_goods or 0) - float(returned_cost or 0))

        stock_value = db.query(
            func.coalesce(func.sum(Product.stock_quantity * Product.purchase_price), 0)
        ).filter(
            Product.tenant_id == context.tenant_id,
            Product.status == "active",
            Product.stock_quantity > 0
        ).scalar()

        in_stock_with_expiry = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.status == "active",
            Product.stock_quantity > 0,
            Product.expiry_date.isnot(None)
        )
        expired_count = in_stock_with_expiry.filter(Product.expiry_date < today).count()
        expiring_7_count = in_stock_with_expiry.filter(
            Product.expiry_date >= today, Product.expiry_date <= today + timedelta(days=7)
        ).count()
        expiring_items = in_stock_with_expiry.filter(
            Product.expiry_date <= today + timedelta(days=30)
        ).order_by(Product.expiry_date).limit(10).all()
        expiring_30_count = in_stock_with_expiry.filter(
            Product.expiry_date >= today, Product.expiry_date <= today + timedelta(days=30)
        ).count()

        reorder_items = db.query(Product).filter(
            Product.tenant_id == context.tenant_id,
            Product.status == "active",
            Product.stock_quantity <= Product.reorder_level
        ).order_by(Product.stock_quantity, Product.product_name).limit(10).all()

        cashier_rows = db.query(
            User.id,
            User.full_name,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total_amount), 0)
        ).join(Sale, Sale.created_by == User.id).filter(
            *sales_filter(today_start, tomorrow_start)
        ).group_by(User.id, User.full_name).order_by(func.sum(Sale.total_amount).desc()).all()

        admin_data = {
            "gross_margin": round(gross_margin, 2),
            "gross_margin_pct": (
                round(gross_margin / revenue_ex_tax * 100, 1) if revenue_ex_tax else None
            ),
            "stock_value": float(stock_value or 0),
            "expired_count": expired_count,
            "expiring_7_count": expiring_7_count,
            "expiring_30_count": expiring_30_count,
            "expiring_items": [
                {
                    "product_id": p.id,
                    "product_name": p.product_name,
                    "expiry_date": str(p.expiry_date),
                    "days_left": (p.expiry_date - today).days,
                    "stock_quantity": float(p.stock_quantity or 0),
                    "unit_type": p.unit_type
                }
                for p in expiring_items
            ],
            "reorder_items": [
                {
                    "product_id": p.id,
                    "product_name": p.product_name,
                    "stock_quantity": float(p.stock_quantity or 0),
                    "reorder_level": float(p.reorder_level or 0),
                    "unit_type": p.unit_type
                }
                for p in reorder_items
            ],
            "cashiers": [
                {"user_id": uid, "full_name": name, "transactions": int(count), "sales": float(total)}
                for uid, name, count, total in cashier_rows
            ]
        }

    return {
        "today_sales": today_sales,
        "today_transactions": today_transactions,
        "mtd_sales": mtd_sales,
        "low_stock_count": low_stock_count or 0,
        "out_of_stock_count": out_of_stock_count or 0,
        "total_products": total_products or 0,
        "total_categories": total_categories or 0,
        "scope": "store" if context.is_admin else "self",
        "as_of": datetime.now(IST).isoformat(timespec="seconds"),
        "today": {
            "avg_bill": round(today_sales / today_transactions, 2) if today_transactions else 0,
            "items_per_bill": round(today_line_items / today_transactions, 1) if today_transactions else 0,
            "discount": today_discount,
            "discount_pct": round(today_discount / (today_sales + today_discount) * 100, 1)
            if (today_sales + today_discount) else 0,
            "yesterday_sales": yesterday_sales,
            "last_week_sales": last_week_sales,
            "vs_yesterday_pct": pct_change(today_sales, yesterday_sales),
            "vs_last_week_pct": pct_change(today_sales, last_week_sales)
        },
        "mtd": {
            "transactions": mtd_transactions,
            "prev_sales": prev_mtd_sales,
            "vs_prev_pct": pct_change(mtd_sales, prev_mtd_sales)
        },
        "cancelled_today": {"count": int(cancelled_count or 0), "amount": float(cancelled_amount or 0)},
        "returns_today": {"count": returns_today_count, "amount": returns_today_amount},
        "payment_mix": [
            {"mode": mode or "other", "transactions": int(count), "amount": float(total)}
            for mode, count, total in payment_rows
        ],
        "hourly_sales": [
            {"hour": h, "transactions": hourly_map.get(h, (0, 0.0))[0], "sales": hourly_map.get(h, (0, 0.0))[1]}
            for h in range(24)
        ],
        "daily_trend": [
            {
                "date": str(d),
                "transactions": daily_map.get(str(d), (0, 0.0))[0],
                "sales": daily_map.get(str(d), (0, 0.0))[1]
            }
            for d in (today - timedelta(days=i) for i in range(6, -1, -1))
        ],
        "top_products": [
            {
                "product_id": p.product_id,
                "product_name": p.product_name,
                "quantity": float(p.quantity or 0),
                "revenue": float(p.revenue or 0)
            }
            for p in top_rows
        ],
        "customers_today": {
            "identified_bills": len(today_customer_ids),
            "unique": len(unique_customer_ids),
            "repeat": repeat_customers
        },
        "admin": admin_data
    }


@router.get("/sales-summary")
async def get_sales_summary(
    from_date: date = Query(...),
    to_date: date = Query(...),
    group_by: str = Query("day", enum=["day", "week", "month"]),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get sales summary report (admin only)
    """
    validate_date_range(from_date, to_date)
    base_query = db.query(Sale).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) >= from_date,
        func.date(Sale.sale_date) <= to_date,
        Sale.status.in_(BILLED_STATUSES)
    )
    returns_query = db.query(SaleReturn).filter(
        SaleReturn.tenant_id == context.tenant_id,
        func.date(SaleReturn.return_date) >= from_date,
        func.date(SaleReturn.return_date) <= to_date
    )

    # Total summary (net = billed minus returns processed in the range)
    gross_sales, gross_tax, gross_discount = base_query.with_entities(
        func.coalesce(func.sum(Sale.total_amount), 0),
        func.coalesce(func.sum(Sale.tax_amount), 0),
        func.coalesce(func.sum(Sale.discount_amount), 0)
    ).one()
    returns_amount, returns_tax, returns_discount, returns_count = returns_query.with_entities(
        func.coalesce(func.sum(SaleReturn.total_amount), 0),
        func.coalesce(func.sum(SaleReturn.tax_amount), 0),
        func.coalesce(func.sum(SaleReturn.discount_amount), 0),
        func.count(SaleReturn.id)
    ).one()
    total_sales = float(gross_sales or 0) - float(returns_amount or 0)
    total_tax = float(gross_tax or 0) - float(returns_tax or 0)
    total_discount = float(gross_discount or 0) - float(returns_discount or 0)
    total_transactions = base_query.count()

    # Daily breakdown
    daily_data = db.query(
        func.date(Sale.sale_date).label("date"),
        func.count(Sale.id).label("transactions"),
        func.sum(Sale.total_amount).label("total_sales"),
        func.sum(Sale.tax_amount).label("total_tax")
    ).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) >= from_date,
        func.date(Sale.sale_date) <= to_date,
        Sale.status.in_(BILLED_STATUSES)
    ).group_by(func.date(Sale.sale_date)).all()
    daily_returns = returns_query.with_entities(
        func.date(SaleReturn.return_date).label("date"),
        func.sum(SaleReturn.total_amount).label("total_returns"),
        func.sum(SaleReturn.tax_amount).label("total_tax")
    ).group_by(func.date(SaleReturn.return_date)).all()

    days = {}
    for d in daily_data:
        days[str(d.date)] = {
            "date": str(d.date), "transactions": d.transactions,
            "total_sales": float(d.total_sales or 0), "total_tax": float(d.total_tax or 0),
            "total_returns": 0.0
        }
    for r in daily_returns:
        day = days.setdefault(str(r.date), {
            "date": str(r.date), "transactions": 0,
            "total_sales": 0.0, "total_tax": 0.0, "total_returns": 0.0
        })
        day["total_returns"] = float(r.total_returns or 0)
        day["total_sales"] -= day["total_returns"]
        day["total_tax"] -= float(r.total_tax or 0)

    return {
        "summary": {
            "gross_sales": float(gross_sales or 0),
            "total_returns": float(returns_amount or 0),
            "returns_count": int(returns_count or 0),
            "total_sales": total_sales,
            "total_tax": total_tax,
            "total_discount": total_discount,
            "total_transactions": total_transactions or 0,
            "average_sale": total_sales / total_transactions if total_transactions else 0
        },
        "daily_data": [days[key] for key in sorted(days)],
        "from_date": str(from_date),
        "to_date": str(to_date)
    }


@router.get("/top-products")
async def get_top_products(
    from_date: date = Query(...),
    to_date: date = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get top selling products (admin only)
    """
    validate_date_range(from_date, to_date)
    lines = net_product_lines(db, context.tenant_id, from_date, to_date)
    top_products = db.query(
        lines.c.product_id,
        func.max(lines.c.product_name).label("product_name"),
        func.sum(lines.c.quantity).label("total_quantity"),
        func.sum(lines.c.amount).label("total_revenue")
    ).group_by(
        lines.c.product_id
    ).order_by(
        func.sum(lines.c.amount).desc()
    ).limit(limit).all()

    return {
        "products": [
            {
                "product_id": p.product_id,
                "product_name": p.product_name,
                "total_quantity": float(p.total_quantity or 0),
                "total_revenue": float(p.total_revenue or 0)
            }
            for p in top_products
        ],
        "from_date": str(from_date),
        "to_date": str(to_date)
    }


@router.get("/category-sales")
async def get_category_sales(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get sales by category (admin only)
    """
    validate_date_range(from_date, to_date)
    lines = net_product_lines(db, context.tenant_id, from_date, to_date)
    product_sales = db.query(
        lines.c.product_id.label("product_id"),
        func.sum(lines.c.amount).label("total_sales"),
        func.sum(lines.c.quantity).label("total_quantity")
    ).group_by(lines.c.product_id).subquery()

    category_sales = db.query(
        Category.id,
        Category.category_name,
        func.coalesce(func.sum(product_sales.c.total_sales), 0).label("total_sales"),
        func.coalesce(func.sum(product_sales.c.total_quantity), 0).label("total_quantity")
    ).outerjoin(
        Product, Product.category_id == Category.id
    ).outerjoin(
        product_sales, product_sales.c.product_id == Product.id
    ).filter(
        Category.tenant_id == context.tenant_id,
        Category.status == "active"
    ).group_by(Category.id, Category.category_name).all()

    return {
        "categories": [
            {
                "category_id": c.id,
                "category_name": c.category_name,
                "total_sales": float(c.total_sales or 0),
                "total_quantity": float(c.total_quantity or 0)
            }
            for c in category_sales
        ],
        "from_date": str(from_date),
        "to_date": str(to_date)
    }


@router.get("/cashier-performance")
async def get_cashier_performance(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get cashier performance report (admin only)
    """
    validate_date_range(from_date, to_date)
    cashier_data = db.query(
        User.id,
        User.full_name,
        func.count(Sale.id).label("total_transactions"),
        func.coalesce(func.sum(Sale.total_amount), 0).label("total_sales")
    ).outerjoin(
        Sale, and_(
            Sale.created_by == User.id,
            func.date(Sale.sale_date) >= from_date,
            func.date(Sale.sale_date) <= to_date,
            Sale.status.in_(BILLED_STATUSES)
        )
    ).filter(
        User.tenant_id == context.tenant_id,
        User.status == "active"
    ).group_by(User.id, User.full_name).all()
    returns_by_user = dict(db.query(
        SaleReturn.created_by,
        func.coalesce(func.sum(SaleReturn.total_amount), 0)
    ).filter(
        SaleReturn.tenant_id == context.tenant_id,
        func.date(SaleReturn.return_date) >= from_date,
        func.date(SaleReturn.return_date) <= to_date
    ).group_by(SaleReturn.created_by).all())

    return {
        "cashiers": [
            {
                "user_id": c.id,
                "full_name": c.full_name,
                "total_transactions": c.total_transactions or 0,
                "total_returns": float(returns_by_user.get(c.id) or 0),
                "total_sales": float(c.total_sales or 0) - float(returns_by_user.get(c.id) or 0)
            }
            for c in cashier_data
        ],
        "from_date": str(from_date),
        "to_date": str(to_date)
    }


@router.get("/stock-report")
async def get_stock_report(
    category_id: Optional[int] = None,
    include_zero_stock: bool = False,
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context),
    current_user = Depends(get_current_admin_user)
):
    """
    Get stock report (admin only)
    """
    query = db.query(Product).filter(
        Product.tenant_id == context.tenant_id,
        Product.status == "active"
    )

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if not include_zero_stock:
        query = query.filter(Product.stock_quantity > 0)

    products = query.order_by(Product.product_name).all()

    total_stock_value = sum(
        (p.stock_quantity or 0) * (p.purchase_price or 0)
        for p in products
    )

    return {
        "products": [
            {
                "product_id": p.id,
                "product_no": p.product_no,
                "product_name": p.product_name,
                "current_stock": float(p.stock_quantity or 0),
                "reorder_level": float(p.reorder_level or 0),
                "purchase_price": float(p.purchase_price or 0),
                "selling_price": float(p.selling_price or p.mrp or 0),
                "stock_value": float((p.stock_quantity or 0) * (p.purchase_price or 0)),
                "is_low_stock": (p.stock_quantity or 0) <= (p.reorder_level or 0)
            }
            for p in products
        ],
        "total_products": len(products),
        "total_stock_value": float(total_stock_value)
    }

