"""
API v1 router aggregation
"""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    tenants,
    users,
    categories,
    gst_items,
    products,
    store_locations,
    suppliers,
    purchases,
    inventory,
    barcode,
    sales,
    sale_returns,
    held_bills,
    shifts,
    clearance,
    offers,
    coupons,
    customers,
    invoices,
    reports,
    gst_reports,
    settings,
    audit,
    customer_auth,
    shop,
    shop_orders,
    online_orders,
)

api_router = APIRouter()

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# Tenant management
api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])

# User management
api_router.include_router(users.router, prefix="/users", tags=["Users"])

# Category management
api_router.include_router(categories.router, prefix="/categories", tags=["Categories"])

# GST lookup items (HSN code and GST %)
api_router.include_router(gst_items.router, prefix="/gst-items", tags=["GST Items"])

# Product management
api_router.include_router(products.router, prefix="/products", tags=["Products"])

# Store locations (product placement)
api_router.include_router(store_locations.router, prefix="/locations", tags=["Store Locations"])

# Supplier management
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["Suppliers"])

# Purchase/Procurement management
api_router.include_router(purchases.router, prefix="/purchases", tags=["Purchases"])

# Inventory management
api_router.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])

# Barcode management
api_router.include_router(barcode.router, prefix="/barcode", tags=["Barcode"])

# Sales/Billing
api_router.include_router(sales.router, prefix="/sales", tags=["Sales"])

# Sale returns (credit notes) and void sale
api_router.include_router(sale_returns.sales_router, prefix="/sales", tags=["Sale Returns"])
api_router.include_router(sale_returns.router, prefix="/sale-returns", tags=["Sale Returns"])

# Held (parked) bills
api_router.include_router(held_bills.router, prefix="/held-bills", tags=["Held Bills"])

# Cashier shifts (cash drawer reconciliation)
api_router.include_router(shifts.router, prefix="/shifts", tags=["Shifts"])

# Near-expiry (clearance) discounts
api_router.include_router(clearance.router, prefix="/clearance", tags=["Clearance"])

# Festival / promotional offers
api_router.include_router(offers.router, prefix="/offers", tags=["Offers"])

# Coupon codes
api_router.include_router(coupons.router, prefix="/coupons", tags=["Coupons"])

# Customers
api_router.include_router(customers.router, prefix="/customers", tags=["Customers"])

# Invoice management
api_router.include_router(invoices.router, prefix="/invoices", tags=["Invoices"])

# Reports
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])

# GST return reports (GSTR-1, GSTR-3B)
api_router.include_router(gst_reports.router, prefix="/reports/gst", tags=["GST Reports"])

# Settings
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])

# Audit logs
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])

# Online shop: customer login by mobile OTP (one login for all stores)
api_router.include_router(customer_auth.router, prefix="/shop/auth", tags=["Shop - Customer Login"])

# Online shop: public catalogue (stores, categories, products)
api_router.include_router(shop.router, prefix="/shop", tags=["Shop - Catalogue"])

# Online shop: delivery addresses, checkout and orders (customer login)
api_router.include_router(shop_orders.router, prefix="/shop", tags=["Shop - Orders"])

# Online orders handled by store staff
api_router.include_router(online_orders.router, prefix="/online-orders", tags=["Online Orders"])

