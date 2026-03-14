/**
 * API Configuration
 */

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
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
  
  // Products
  PRODUCTS: '/products',
  PRODUCT_SEARCH: '/products/search',
  
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
  BARCODE_PRINT: '/barcode/print',
  
  // Sales
  SALES: '/sales',
  
  // Invoices
  INVOICES: '/invoices',
  
  // Reports
  REPORTS_DASHBOARD: '/reports/dashboard',
  REPORTS_SALES_SUMMARY: '/reports/sales-summary',
  REPORTS_TOP_PRODUCTS: '/reports/top-products',
  REPORTS_CATEGORY_SALES: '/reports/category-sales',
  REPORTS_CASHIER_PERFORMANCE: '/reports/cashier-performance',
  REPORTS_STOCK: '/reports/stock-report',
  
  // Settings
  SETTINGS: '/settings',
  SETTINGS_STORE: '/settings/store',
  SETTINGS_BILLING: '/settings/billing',
  
  // Audit
  AUDIT_LOGS: '/audit',
};

