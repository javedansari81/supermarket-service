-- =====================================================
-- Supermarket Management System - Sample Categories
-- Database: warsi_db
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- =====================================================
-- SAMPLE CATEGORIES FOR WARSI FAMILY MART
-- =====================================================

DO $$
DECLARE
    v_tenant_id INTEGER;
    v_admin_id INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = 'SFM001';
    SELECT id INTO v_admin_id FROM users WHERE tenant_id = v_tenant_id AND username = 'admin';
    
    INSERT INTO categories (tenant_id, category_name, description, status, created_by) VALUES
        (v_tenant_id, 'Groceries', 'Daily grocery items including rice, flour, pulses', 'active', v_admin_id),
        (v_tenant_id, 'Beverages', 'Soft drinks, juices, water, tea, coffee', 'active', v_admin_id),
        (v_tenant_id, 'Dairy Products', 'Milk, cheese, butter, yogurt, cream', 'active', v_admin_id),
        (v_tenant_id, 'Snacks', 'Chips, biscuits, cookies, namkeen', 'active', v_admin_id),
        (v_tenant_id, 'Personal Care', 'Soaps, shampoos, toothpaste, skincare', 'active', v_admin_id),
        (v_tenant_id, 'Household', 'Cleaning supplies, detergents, utensils', 'active', v_admin_id),
        (v_tenant_id, 'Frozen Foods', 'Ice cream, frozen vegetables, frozen snacks', 'active', v_admin_id),
        (v_tenant_id, 'Bakery', 'Bread, cakes, pastries, buns', 'active', v_admin_id),
        (v_tenant_id, 'Fruits & Vegetables', 'Fresh fruits and vegetables', 'active', v_admin_id),
        (v_tenant_id, 'Meat & Seafood', 'Fresh and frozen meat, fish, poultry', 'active', v_admin_id),
        (v_tenant_id, 'Baby Products', 'Baby food, diapers, baby care items', 'active', v_admin_id),
        (v_tenant_id, 'Health & Wellness', 'Vitamins, supplements, health foods', 'active', v_admin_id),
        (v_tenant_id, 'Stationery', 'Pens, notebooks, office supplies', 'active', v_admin_id),
        (v_tenant_id, 'Pet Supplies', 'Pet food, pet care items', 'active', v_admin_id)
    ON CONFLICT (tenant_id, category_name) DO NOTHING;
END $$;

