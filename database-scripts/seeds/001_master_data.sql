-- =====================================================
-- Supermarket Management System - Master Data Seeds
-- Database: warsi_db
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- =====================================================
-- ROLES
-- =====================================================

INSERT INTO roles (role_name, description) VALUES
    ('admin', 'Administrator with full access to all features'),
    ('cashier', 'Seller/Cashier with access to billing and limited features')
ON CONFLICT (role_name) DO NOTHING;

-- =====================================================
-- UNIT TYPES
-- =====================================================

INSERT INTO unit_types (unit_code, unit_name, description) VALUES
    ('pcs', 'Pieces', 'Individual pieces or units'),
    ('kg', 'Kilogram', 'Weight in kilograms'),
    ('g', 'Gram', 'Weight in grams'),
    ('l', 'Liter', 'Volume in liters'),
    ('ml', 'Milliliter', 'Volume in milliliters'),
    ('box', 'Box', 'Box or carton'),
    ('pack', 'Pack', 'Pack or bundle'),
    ('dozen', 'Dozen', '12 pieces')
ON CONFLICT (unit_code) DO NOTHING;

-- =====================================================
-- FIRST TENANT: Warsi Family Mart
-- =====================================================

INSERT INTO tenants (tenant_code, tenant_name, address, contact_no, email, gst_no, status)
VALUES (
    'SFM001',
    'Warsi Family Mart',
    '123 Main Street, City Center',
    '+91-9876543210',
    'contact@warsi.in',
    'GSTIN1234567890',
    'active'
)
ON CONFLICT (tenant_code) DO NOTHING;

-- =====================================================
-- TENANT SETTINGS FOR WARSI FAMILY MART
-- =====================================================

-- Get tenant ID
DO $$
DECLARE
    v_tenant_id INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = 'SFM001';
    
    -- Insert default settings
    INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description) VALUES
        (v_tenant_id, 'store_name', 'Warsi Family Mart', 'string', 'Store display name'),
        (v_tenant_id, 'store_address', '123 Main Street, City Center', 'string', 'Store address for invoices'),
        (v_tenant_id, 'store_phone', '+91-9876543210', 'string', 'Store contact number'),
        (v_tenant_id, 'store_email', 'contact@warsi.in', 'string', 'Store email'),
        (v_tenant_id, 'store_gst', 'GSTIN1234567890', 'string', 'GST number'),
        (v_tenant_id, 'invoice_prefix', 'INV', 'string', 'Invoice number prefix'),
        (v_tenant_id, 'invoice_footer', 'Thank you for shopping with us!', 'string', 'Invoice footer message'),
        (v_tenant_id, 'currency_symbol', '₹', 'string', 'Currency symbol'),
        (v_tenant_id, 'decimal_places', '2', 'number', 'Decimal places for amounts'),
        (v_tenant_id, 'tax_inclusive', 'false', 'boolean', 'Whether prices include tax'),
        (v_tenant_id, 'default_tax_percent', '18', 'number', 'Default tax percentage'),
        (v_tenant_id, 'barcode_format', 'code128', 'string', 'Default barcode format'),
        (v_tenant_id, 'low_stock_threshold', '10', 'number', 'Low stock alert threshold')
    ON CONFLICT (tenant_id, setting_key) DO NOTHING;
END $$;

-- =====================================================
-- DEFAULT ADMIN USER FOR WARSI FAMILY MART
-- Password: admin123 (hashed with bcrypt)
-- =====================================================

DO $$
DECLARE
    v_tenant_id INTEGER;
    v_admin_role_id INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = 'SFM001';
    SELECT id INTO v_admin_role_id FROM roles WHERE role_name = 'admin';
    
    INSERT INTO users (tenant_id, role_id, username, email, password_hash, full_name, contact_no, status)
    VALUES (
        v_tenant_id,
        v_admin_role_id,
        'admin',
        'admin@warsi.in',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYWWQIqjSXHe', -- admin123
        'System Administrator',
        '+91-9876543210',
        'active'
    )
    ON CONFLICT (tenant_id, username) DO NOTHING;
END $$;

-- =====================================================
-- DEFAULT BARCODE CONFIG FOR WARSI FAMILY MART
-- =====================================================

DO $$
DECLARE
    v_tenant_id INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = 'SFM001';
    
    INSERT INTO barcode_configs (tenant_id, config_name, barcode_format, label_width, label_height, 
                                  show_store_name, show_product_no, show_mrp, show_barcode, 
                                  font_size, is_default)
    VALUES (
        v_tenant_id,
        'Default Label',
        'code128',
        50.00,
        30.00,
        TRUE,
        TRUE,
        TRUE,
        TRUE,
        10,
        TRUE
    )
    ON CONFLICT (tenant_id, config_name) DO NOTHING;
END $$;

