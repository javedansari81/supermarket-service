/**
 * API Configuration
 */

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  ME: '/auth/me',
  
  // Tenants
  TENANTS: '/tenants',
  TENANT_CURRENT: '/tenants/current',
  
  // Users
  USERS: '/users',
  ROLES: '/users/roles',
  
  // Categories
  CATEGORIES: '/categories',
  CATEGORIES_ACTIVE: '/categories/active',

  // GST lookup items
  GST_ITEMS: '/gst-items',

  // Products
  PRODUCTS: '/products',
  PRODUCT_SEARCH: '/products/search',
  PRODUCTS_IMPORT: '/products/import',
  PRODUCTS_IMPORT_TEMPLATE: '/products/import/template',

  // Store locations
  LOCATIONS: '/locations',
  LOCATIONS_ACTIVE: '/locations/active',
  LOCATIONS_SUGGEST: '/locations/suggest',

  // Suppliers
  SUPPLIERS: '/suppliers',
  SUPPLIERS_ACTIVE: '/suppliers/active',
  
  // Purchases
  PURCHASES: '/purchases',
  
  // Inventory
  INVENTORY_STOCK: '/inventory/stock',
  INVENTORY_MOVEMENTS: '/inventory/movements',
  INVENTORY_ADJUST: '/inventory/adjust',
  
  // Barcode
  BARCODE_CONFIGS: '/barcode/configs',
  BARCODE_GENERATE: '/barcode/generate',
  BARCODE_GENERATE_CODE: '/barcode/generate-code',
  BARCODE_PRINT: '/barcode/print',
  BARCODE_PACKED_LABELS: '/barcode/packed-labels',
  BARCODE_SCALE_EXPORT: '/barcode/scale-export',
  
  // Sales
  SALES: '/sales',
  SALE_RETURNS: '/sale-returns',
  HELD_BILLS: '/held-bills',

  // Near-expiry (clearance) discounts
  CLEARANCE_RULES: '/clearance/rules',
  CLEARANCE_SETTINGS: '/clearance/settings',
  CLEARANCE_NEAR_EXPIRY: '/clearance/near-expiry',
  CLEARANCE_MARKDOWN: '/clearance/markdown',

  // Festival / promotional offers
  OFFERS: '/offers',

  // Coupon codes
  COUPONS: '/coupons',
  COUPON_CHECK: '/sales/coupon-check',

  // Customers
  CUSTOMERS: '/customers',
  CUSTOMER_LOOKUP: '/customers/lookup',

  // Invoices
  INVOICES: '/invoices',
  
  // Reports
  REPORTS_DASHBOARD: '/reports/dashboard',
  REPORTS_SALES_SUMMARY: '/reports/sales-summary',
  REPORTS_TOP_PRODUCTS: '/reports/top-products',
  REPORTS_CATEGORY_SALES: '/reports/category-sales',
  REPORTS_CASHIER_PERFORMANCE: '/reports/cashier-performance',
  REPORTS_PAYMENT_MODES: '/reports/payment-modes',
  REPORTS_STOCK: '/reports/stock-report',
  
  // Settings
  SETTINGS: '/settings',
  SETTINGS_STORE: '/settings/store',
  SETTINGS_BILLING: '/settings/billing',
  SETTINGS_LOYALTY: '/settings/loyalty',
  
  // Audit
  AUDIT_LOGS: '/audit',
};

