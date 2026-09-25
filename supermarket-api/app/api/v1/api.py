"""
API v1 router aggregation
"""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    tenants,
    users,
    categories,
    products,
    store_locations,
    suppliers,
    purchases,
    inventory,
    barcode,
    sales,
    sale_returns,
    customers,
    invoices,
    reports,
    settings,
    audit,
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

# Customers
api_router.include_router(customers.router, prefix="/customers", tags=["Customers"])

# Invoice management
api_router.include_router(invoices.router, prefix="/invoices", tags=["Invoices"])

# Reports
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])

# Settings
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])

# Audit logs
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])

