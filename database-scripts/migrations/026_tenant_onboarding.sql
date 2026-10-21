-- =====================================================
-- Supermarket Management System - New tenant onboarding defaults
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Categories every new store starts with
CREATE TABLE IF NOT EXISTS default_categories (
    category_name VARCHAR(100) PRIMARY KEY,
    description TEXT
);

INSERT INTO default_categories (category_name, description) VALUES
    ('Groceries', 'Daily grocery items including rice, flour, pulses'),
    ('Beverages', 'Soft drinks, juices, water, tea, coffee'),
    ('Dairy Products', 'Milk, cheese, butter, yogurt, cream'),
    ('Snacks', 'Chips, biscuits, cookies, namkeen'),
    ('Personal Care', 'Soaps, shampoos, toothpaste, skincare'),
    ('Household', 'Cleaning supplies, detergents, utensils'),
    ('Frozen Foods', 'Ice cream, frozen vegetables, frozen snacks'),
    ('Bakery', 'Bread, cakes, pastries, buns'),
    ('Fruits & Vegetables', 'Fresh fruits and vegetables'),
    ('Meat & Seafood', 'Fresh and frozen meat, fish, poultry'),
    ('Baby Products', 'Baby food, diapers, baby care items'),
    ('Health & Wellness', 'Vitamins, supplements, health foods'),
    ('Stationery', 'Pens, notebooks, office supplies'),
    ('Pet Supplies', 'Pet food, pet care items'),
    ('Tobacco', 'Cigarettes, bidi, tobacco, pan masala')
ON CONFLICT (category_name) DO NOTHING;

-- Default category of each shared GST item (same placement as migration 016)
CREATE TABLE IF NOT EXISTS default_category_gst_items (
    gst_item_id INTEGER PRIMARY KEY REFERENCES gst_items(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL REFERENCES default_categories(category_name) ON DELETE CASCADE
);

INSERT INTO default_category_gst_items (gst_item_id, category_name)
SELECT g.id, m.category_name
FROM (VALUES
    ('Rice', 'Groceries'), ('Wheat', 'Groceries'), ('Atta / wheat flour', 'Groceries'),
    ('Suji / rava / dalia', 'Groceries'), ('Besan / pulse flour', 'Groceries'),
    ('Dal / pulses (dried)', 'Groceries'), ('Sugar', 'Groceries'), ('Jaggery (gur)', 'Groceries'),
    ('Salt', 'Groceries'), ('Edible oil', 'Groceries'), ('Spices (whole / ground)', 'Groceries'),
    ('Dry fruits / nuts', 'Groceries'),
    ('Tea', 'Beverages'), ('Coffee', 'Beverages'), ('Fruit juice', 'Beverages'),
    ('Packaged drinking water', 'Beverages'), ('Aerated / sugary soft drinks', 'Beverages'),
    ('Fresh milk / UHT milk', 'Dairy Products'), ('Curd / lassi / buttermilk', 'Dairy Products'),
    ('Paneer', 'Dairy Products'), ('Cheese', 'Dairy Products'), ('Ghee / butter', 'Dairy Products'),
    ('Eggs', 'Dairy Products'),
    ('Namkeen / bhujia / mixture', 'Snacks'), ('Noodles / pasta', 'Snacks'), ('Chocolates', 'Snacks'),
    ('Sweets / sugar confectionery', 'Snacks'), ('Cornflakes / breakfast cereals', 'Snacks'),
    ('Jam / sauce / ketchup', 'Snacks'),
    ('Bread / roti / khakhra', 'Bakery'), ('Biscuits / rusk / cakes', 'Bakery'),
    ('Ice cream / frozen desserts', 'Frozen Foods'), ('Frozen vegetables', 'Frozen Foods'),
    ('Fresh vegetables', 'Fruits & Vegetables'), ('Fresh fruits', 'Fruits & Vegetables'),
    ('Fresh chicken / meat', 'Meat & Seafood'), ('Frozen chicken / meat', 'Meat & Seafood'),
    ('Fresh fish / seafood', 'Meat & Seafood'), ('Frozen fish / prawns', 'Meat & Seafood'),
    ('Toilet soap', 'Personal Care'), ('Shampoo / hair oil', 'Personal Care'),
    ('Toothpaste / tooth powder', 'Personal Care'), ('Toothbrush', 'Personal Care'),
    ('Talcum / face powder', 'Personal Care'), ('Shaving cream / aftershave', 'Personal Care'),
    ('Sanitary napkins', 'Personal Care'),
    ('Detergent / washing powder', 'Household'), ('Floor / toilet cleaner', 'Household'),
    ('Mosquito repellent', 'Household'), ('Agarbatti / dhoop', 'Household'), ('Matchbox', 'Household'),
    ('Candles', 'Household'), ('Steel utensils / kitchenware', 'Household'), ('Batteries', 'Household'),
    ('Baby diapers', 'Baby Products'), ('Feeding bottles', 'Baby Products'),
    ('Medicines (OTC)', 'Health & Wellness'),
    ('Notebooks / exercise books', 'Stationery'), ('Pencils / crayons', 'Stationery'),
    ('Pens / markers', 'Stationery'),
    ('Dog / cat food', 'Pet Supplies'),
    ('Cigarettes / tobacco / pan masala', 'Tobacco')
) AS m (item_name, category_name)
JOIN gst_items g ON g.item_name = m.item_name
ON CONFLICT (gst_item_id) DO NOTHING;

-- Gives a tenant its starting settings, label config, categories, GST items and clearance tiers.
-- Safe to run again: existing rows are left as they are.
CREATE OR REPLACE FUNCTION setup_tenant_defaults(p_tenant_code VARCHAR)
RETURNS VOID AS $$
DECLARE
    v_tenant_id INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = p_tenant_code;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant % not found', p_tenant_code;
    END IF;

    INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description)
    SELECT v_tenant_id, d.setting_key, d.setting_value, d.setting_type, d.description
    FROM (VALUES
        ('currency_symbol', '₹', 'string', 'Currency symbol'),
        ('tax_inclusive_pricing', 'true', 'boolean', 'Prices include tax'),
        ('default_tax_percent', '0', 'number', 'Default tax percentage'),
        ('invoice_prefix', 'INV', 'string', 'Invoice number prefix'),
        ('invoice_footer', 'Thank you for shopping!', 'string', 'Invoice footer text'),
        ('clearance_enabled', 'false', 'boolean', 'Apply near-expiry discount tiers'),
        ('loyalty_enabled', 'false', 'boolean', 'Loyalty points enabled'),
        ('low_stock_threshold', '10', 'number', 'Low stock warning threshold')
    ) AS d (setting_key, setting_value, setting_type, description)
    ON CONFLICT (tenant_id, setting_key) DO NOTHING;

    INSERT INTO barcode_configs (tenant_id, config_name, barcode_format, label_width, label_height,
                                 show_store_name, show_product_no, show_mrp, show_barcode,
                                 font_size, is_default)
    VALUES (v_tenant_id, 'Default Label', 'code128', 50.00, 30.00, TRUE, TRUE, TRUE, TRUE, 10, TRUE)
    ON CONFLICT (tenant_id, config_name) DO NOTHING;

    INSERT INTO categories (tenant_id, category_name, description, status)
    SELECT v_tenant_id, category_name, description, 'active' FROM default_categories
    ON CONFLICT (tenant_id, category_name) DO NOTHING;

    INSERT INTO category_gst_items (tenant_id, category_id, gst_item_id)
    SELECT v_tenant_id, c.id, d.gst_item_id
    FROM default_category_gst_items d
    JOIN categories c ON c.tenant_id = v_tenant_id AND c.category_name = d.category_name
    ON CONFLICT (tenant_id, gst_item_id) DO NOTHING;

    INSERT INTO clearance_rules (tenant_id, tiers)
    SELECT v_tenant_id,
           '[{"days_left": 30, "percent": 10}, {"days_left": 15, "percent": 20}, {"days_left": 7, "percent": 30}]'::jsonb
    WHERE NOT EXISTS (
        SELECT 1 FROM clearance_rules r
        WHERE r.tenant_id = v_tenant_id AND r.category_id IS NULL AND r.product_id IS NULL
    );
END;
$$ LANGUAGE plpgsql;
