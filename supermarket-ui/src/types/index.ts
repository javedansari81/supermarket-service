/**
 * TypeScript type definitions
 */

// Auth types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  username: string;
  role: string;
  tenant_id: number;
  tenant_name: string;
}

export interface Role {
  id: number;
  role_name: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role | string;
  role_id?: number;
  tenant_id: number;
  tenant_name?: string;
  status: string;
  last_login?: string;
}

// Tenant types
export interface Tenant {
  id: number;
  tenant_code: string;
  tenant_name: string;
  status: string;
  created_at: string;
}

// Category types
export interface Category {
  id: number;
  category_name: string;
  description?: string;
  status: string;
  created_at: string;
}

// Product types
export interface Product {
  id: number;
  product_no: string;
  product_name: string;
  barcode?: string;
  category_id?: number;
  category_name?: string;
  mrp?: number;
  selling_price?: number;
  purchase_price?: number;
  tax_percent?: number;
  stock_quantity: number;
  reorder_level?: number;
  unit_type: string;
  status: string;
}

// Supplier types
export interface Supplier {
  id: number;
  supplier_code: string;
  supplier_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: string;
}

// Sale types
export interface SaleItem {
  product_id: number;
  product_name?: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
  line_total?: number;
}

export interface Sale {
  id: number;
  sale_no: string;
  sale_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_mode: string;
  customer_name?: string;
  customer_phone?: string;
  status: string;
  items: SaleItem[];
}

// Invoice types
export interface Invoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  sale_id: number;
  total_amount: number;
  customer_name?: string;
}

// Dashboard types
export interface DashboardData {
  today_sales: number;
  today_transactions: number;
  mtd_sales: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_products: number;
  total_categories: number;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

