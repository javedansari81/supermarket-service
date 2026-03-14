"""
Reports endpoints
"""
from typing import Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.core.database import get_db
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.models.purchase import Purchase
from app.models.category import Category
from app.models.stock_movement import StockMovement
from app.models.user import User
from app.api.deps import get_current_admin_user, get_tenant_context, TenantContext

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(
    db: Session = Depends(get_db),
    context: TenantContext = Depends(get_tenant_context)
):
    """
    Get dashboard summary data
    """
    today = date.today()
    start_of_month = today.replace(day=1)
    
    # Today's sales
    today_sales = db.query(
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) == today,
        Sale.status == "completed"
    ).scalar()
    
    # Today's transactions count
    today_transactions = db.query(
        func.count(Sale.id)
    ).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) == today,
        Sale.status == "completed"
    ).scalar()
    
    # Month-to-date sales
    mtd_sales = db.query(
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) >= start_of_month,
        Sale.status == "completed"
    ).scalar()
    
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
    
    return {
        "today_sales": float(today_sales or 0),
        "today_transactions": today_transactions or 0,
        "mtd_sales": float(mtd_sales or 0),
        "low_stock_count": low_stock_count or 0,
        "out_of_stock_count": out_of_stock_count or 0,
        "total_products": total_products or 0,
        "total_categories": total_categories or 0
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
    base_query = db.query(Sale).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) >= from_date,
        func.date(Sale.sale_date) <= to_date,
        Sale.status == "completed"
    )
    
    # Total summary
    total_sales = base_query.with_entities(
        func.coalesce(func.sum(Sale.total_amount), 0)
    ).scalar()
    
    total_tax = base_query.with_entities(
        func.coalesce(func.sum(Sale.tax_amount), 0)
    ).scalar()
    
    total_discount = base_query.with_entities(
        func.coalesce(func.sum(Sale.discount_amount), 0)
    ).scalar()
    
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
        Sale.status == "completed"
    ).group_by(func.date(Sale.sale_date)).order_by(func.date(Sale.sale_date)).all()
    
    return {
        "summary": {
            "total_sales": float(total_sales or 0),
            "total_tax": float(total_tax or 0),
            "total_discount": float(total_discount or 0),
            "total_transactions": total_transactions or 0,
            "average_sale": float(total_sales / total_transactions) if total_transactions else 0
        },
        "daily_data": [
            {
                "date": str(d.date),
                "transactions": d.transactions,
                "total_sales": float(d.total_sales or 0),
                "total_tax": float(d.total_tax or 0)
            }
            for d in daily_data
        ],
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
    top_products = db.query(
        SaleItem.product_id,
        SaleItem.product_name,
        func.sum(SaleItem.quantity).label("total_quantity"),
        func.sum(SaleItem.line_total).label("total_revenue")
    ).join(Sale).filter(
        Sale.tenant_id == context.tenant_id,
        func.date(Sale.sale_date) >= from_date,
        func.date(Sale.sale_date) <= to_date,
        Sale.status == "completed"
    ).group_by(
        SaleItem.product_id, SaleItem.product_name
    ).order_by(
        func.sum(SaleItem.line_total).desc()
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
    category_sales = db.query(
        Category.id,
        Category.category_name,
        func.coalesce(func.sum(SaleItem.line_total), 0).label("total_sales"),
        func.coalesce(func.sum(SaleItem.quantity), 0).label("total_quantity")
    ).outerjoin(
        Product, Product.category_id == Category.id
    ).outerjoin(
        SaleItem, SaleItem.product_id == Product.id
    ).outerjoin(
        Sale, and_(
            Sale.id == SaleItem.sale_id,
            func.date(Sale.sale_date) >= from_date,
            func.date(Sale.sale_date) <= to_date,
            Sale.status == "completed"
        )
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
            Sale.status == "completed"
        )
    ).filter(
        User.tenant_id == context.tenant_id,
        User.status == "active"
    ).group_by(User.id, User.full_name).all()

    return {
        "cashiers": [
            {
                "user_id": c.id,
                "full_name": c.full_name,
                "total_transactions": c.total_transactions or 0,
                "total_sales": float(c.total_sales or 0)
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

