-- =====================================================
-- Supermarket Management System - Initial Schema
-- Database: sunrise_school_db
-- Schema: mart
-- Multi-tenant ready with tenant_id based isolation
-- =====================================================

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS mart;

-- Set search path
SET search_path TO mart, public;

-- =====================================================
-- MASTER TABLES
-- =====================================================

-- Tenants table (multi-tenant support)
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    tenant_code VARCHAR(50) UNIQUE NOT NULL,
    tenant_name VARCHAR(200) NOT NULL,
    address TEXT,
    contact_no VARCHAR(20),
    email VARCHAR(100),
    gst_no VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table (shared across tenants)
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (tenant-specific)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200),
    contact_no VARCHAR(20),
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, username)
);

-- Tenant settings table
CREATE TABLE IF NOT EXISTS tenant_settings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, setting_key)
);

-- =====================================================
-- LOOKUP/REFERENCE TABLES
-- =====================================================

-- Unit types table (shared across tenants)
CREATE TABLE IF NOT EXISTS unit_types (
    id SERIAL PRIMARY KEY,
    unit_code VARCHAR(20) UNIQUE NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PRODUCT & INVENTORY TABLES
-- =====================================================

-- Categories table (tenant-specific)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, category_name)
);

-- Products table (tenant-specific)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_no VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    brand VARCHAR(100),
    barcode VARCHAR(100),
    purchase_price DECIMAL(10, 2),
    mrp DECIMAL(10, 2),
    selling_price DECIMAL(10, 2),
    tax_percent DECIMAL(5, 2) DEFAULT 0,
    unit_type VARCHAR(50) DEFAULT 'pcs',
    stock_quantity DECIMAL(10, 2) DEFAULT 0,
    reorder_level DECIMAL(10, 2) DEFAULT 0,
    expiry_date DATE,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, product_no),
    UNIQUE (tenant_id, barcode)
);

-- Suppliers table (tenant-specific)
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_code VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    contact_no VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    gst_no VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, supplier_code)
);

-- Purchases table (tenant-specific)
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_no VARCHAR(50) NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_invoice_no VARCHAR(100),
    purchase_date DATE NOT NULL,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    UNIQUE (tenant_id, purchase_no)
);

-- Purchase items table
CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock movements table (for inventory tracking)
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'purchase_in', 'sale_out', 'adjustment_in', 'adjustment_out',
        'damage_out', 'expired_out', 'return_in'
    )),
    quantity DECIMAL(10, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);
