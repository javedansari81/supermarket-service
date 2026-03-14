-- =====================================================
-- Supermarket Management System - Sales Schema
-- Database: sunrise_school_db
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- =====================================================
-- SALES & BILLING TABLES
-- =====================================================

-- Sales table (tenant-specific)
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_no VARCHAR(50) NOT NULL,
    sale_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    payment_mode VARCHAR(50) DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'card', 'upi', 'credit')),
    payment_status VARCHAR(20) DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'partial')),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled', 'refunded')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, sale_no)
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name VARCHAR(200) NOT NULL,
    barcode VARCHAR(100),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table (tenant-specific)
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    invoice_no VARCHAR(50) NOT NULL,
    invoice_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    store_name VARCHAR(200),
    store_address TEXT,
    store_contact VARCHAR(50),
    store_gst VARCHAR(50),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    payment_mode VARCHAR(50),
    footer_message TEXT,
    printed_count INTEGER DEFAULT 0,
    last_printed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, invoice_no)
);

-- =====================================================
-- AUDIT LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INTEGER,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- BARCODE CONFIGURATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS barcode_configs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    config_name VARCHAR(100) NOT NULL,
    barcode_format VARCHAR(50) DEFAULT 'code128',
    label_width DECIMAL(5, 2) DEFAULT 50,
    label_height DECIMAL(5, 2) DEFAULT 30,
    show_store_name BOOLEAN DEFAULT TRUE,
    show_product_no BOOLEAN DEFAULT TRUE,
    show_mrp BOOLEAN DEFAULT TRUE,
    show_barcode BOOLEAN DEFAULT TRUE,
    font_size INTEGER DEFAULT 10,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, config_name)
);

