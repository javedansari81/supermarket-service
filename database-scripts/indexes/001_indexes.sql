-- =====================================================
-- Supermarket Management System - Indexes
-- Database: warsi_db
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- =====================================================
-- TENANT INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_tenant_code ON tenants(tenant_code);

-- =====================================================
-- USER INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- =====================================================
-- CATEGORY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_status ON categories(tenant_id, status);

-- =====================================================
-- PRODUCT INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_product_no ON products(tenant_id, product_no);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(tenant_id, stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(tenant_id, product_name);

-- =====================================================
-- SUPPLIER INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_code ON suppliers(tenant_id, supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(tenant_id, status);

-- =====================================================
-- PURCHASE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_purchases_tenant_id ON purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_no ON purchases(tenant_id, purchase_no);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(tenant_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);

-- =====================================================
-- STOCK MOVEMENT INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(tenant_id, movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(tenant_id, created_at);

-- =====================================================
-- SALES INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sales_tenant_id ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_no ON sales(tenant_id, sale_no);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(tenant_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- =====================================================
-- INVOICE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_no ON invoices(tenant_id, invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(tenant_id, invoice_date);

-- =====================================================
-- AUDIT LOG INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(tenant_id, created_at);

-- =====================================================
-- TENANT SETTINGS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_key ON tenant_settings(tenant_id, setting_key);

