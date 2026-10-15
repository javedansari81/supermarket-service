-- =====================================================
-- Supermarket Management System - GST lookup items
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- GST items are shared by all tenants; the item picked on a product decides its HSN and GST %.
-- Loose = sold loose / weighed; packed = pre-packaged and labelled
CREATE TABLE IF NOT EXISTS gst_items (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL UNIQUE,
    hsn_code VARCHAR(8) NOT NULL CHECK (hsn_code ~ '^[0-9]{4,8}$'),
    gst_percent_loose DECIMAL(5, 2) NOT NULL CHECK (gst_percent_loose BETWEEN 0 AND 100),
    gst_percent_packed DECIMAL(5, 2) NOT NULL CHECK (gst_percent_packed BETWEEN 0 AND 100),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Each tenant places a GST item under one of its categories
CREATE TABLE IF NOT EXISTS category_gst_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    gst_item_id INTEGER NOT NULL REFERENCES gst_items(id) ON DELETE CASCADE,
    UNIQUE (tenant_id, gst_item_id)
);
CREATE INDEX IF NOT EXISTS idx_category_gst_items_category ON category_gst_items(category_id);

-- Rates as per Notifications 9/2025 and 10/2025-Central Tax (Rate), effective 22 Sep 2025
WITH items (item_name, hsn_code, gst_percent_loose, gst_percent_packed, category_name) AS (
    VALUES
    ('Rice', '1006', 0, 5, 'Groceries'),
    ('Wheat', '1001', 0, 5, 'Groceries'),
    ('Atta / wheat flour', '1101', 0, 5, 'Groceries'),
    ('Suji / rava / dalia', '1103', 0, 5, 'Groceries'),
    ('Besan / pulse flour', '1106', 0, 5, 'Groceries'),
    ('Dal / pulses (dried)', '0713', 0, 5, 'Groceries'),
    ('Sugar', '1701', 5, 5, 'Groceries'),
    ('Jaggery (gur)', '1701', 0, 5, 'Groceries'),
    ('Salt', '2501', 0, 0, 'Groceries'),
    ('Edible oil', '1508', 5, 5, 'Groceries'),
    ('Spices (whole / ground)', '0910', 5, 5, 'Groceries'),
    ('Dry fruits / nuts', '0802', 5, 5, 'Groceries'),
    ('Tea', '0902', 5, 5, 'Beverages'),
    ('Coffee', '0901', 5, 5, 'Beverages'),
    ('Fruit juice', '2009', 5, 5, 'Beverages'),
    ('Packaged drinking water', '2201', 5, 5, 'Beverages'),
    ('Aerated / sugary soft drinks', '2202', 40, 40, 'Beverages'),
    ('Fresh milk / UHT milk', '0401', 0, 0, 'Dairy Products'),
    ('Curd / lassi / buttermilk', '0403', 0, 5, 'Dairy Products'),
    ('Paneer', '0406', 0, 0, 'Dairy Products'),
    ('Cheese', '0406', 5, 5, 'Dairy Products'),
    ('Ghee / butter', '0405', 5, 5, 'Dairy Products'),
    ('Eggs', '0407', 0, 0, 'Dairy Products'),
    ('Namkeen / bhujia / mixture', '2106', 5, 5, 'Snacks'),
    ('Noodles / pasta', '1902', 5, 5, 'Snacks'),
    ('Chocolates', '1806', 5, 5, 'Snacks'),
    ('Sweets / sugar confectionery', '1704', 5, 5, 'Snacks'),
    ('Cornflakes / breakfast cereals', '1904', 5, 5, 'Snacks'),
    ('Jam / sauce / ketchup', '2103', 5, 5, 'Snacks'),
    ('Bread / roti / khakhra', '1905', 0, 0, 'Bakery'),
    ('Biscuits / rusk / cakes', '1905', 5, 5, 'Bakery'),
    ('Ice cream / frozen desserts', '2105', 5, 5, 'Frozen Foods'),
    ('Frozen vegetables', '0710', 5, 5, 'Frozen Foods'),
    ('Fresh vegetables', '0709', 0, 0, 'Fruits & Vegetables'),
    ('Fresh fruits', '0810', 0, 0, 'Fruits & Vegetables'),
    ('Fresh chicken / meat', '0207', 0, 0, 'Meat & Seafood'),
    ('Frozen chicken / meat', '0207', 0, 5, 'Meat & Seafood'),
    ('Fresh fish / seafood', '0302', 0, 0, 'Meat & Seafood'),
    ('Frozen fish / prawns', '0303', 0, 5, 'Meat & Seafood'),
    ('Toilet soap', '3401', 5, 5, 'Personal Care'),
    ('Shampoo / hair oil', '3305', 5, 5, 'Personal Care'),
    ('Toothpaste / tooth powder', '3306', 5, 5, 'Personal Care'),
    ('Toothbrush', '9603', 5, 5, 'Personal Care'),
    ('Talcum / face powder', '3304', 5, 5, 'Personal Care'),
    ('Shaving cream / aftershave', '3307', 5, 5, 'Personal Care'),
    ('Sanitary napkins', '9619', 0, 0, 'Personal Care'),
    ('Detergent / washing powder', '3402', 18, 18, 'Household'),
    ('Floor / toilet cleaner', '3402', 18, 18, 'Household'),
    ('Mosquito repellent', '3808', 18, 18, 'Household'),
    ('Agarbatti / dhoop', '3307', 5, 5, 'Household'),
    ('Matchbox', '3605', 5, 5, 'Household'),
    ('Candles', '3406', 5, 5, 'Household'),
    ('Steel utensils / kitchenware', '7323', 5, 5, 'Household'),
    ('Batteries', '8506', 18, 18, 'Household'),
    ('Baby diapers', '9619', 5, 5, 'Baby Products'),
    ('Feeding bottles', '3926', 5, 5, 'Baby Products'),
    ('Medicines (OTC)', '3004', 5, 5, 'Health & Wellness'),
    ('Notebooks / exercise books', '4820', 0, 0, 'Stationery'),
    ('Pencils / crayons', '9609', 0, 0, 'Stationery'),
    ('Pens / markers', '9608', 18, 18, 'Stationery'),
    ('Dog / cat food', '2309', 18, 18, 'Pet Supplies'),
    ('Cigarettes / tobacco / pan masala', '2402', 40, 40, 'Tobacco')
), ins AS (
    INSERT INTO gst_items (item_name, hsn_code, gst_percent_loose, gst_percent_packed)
    SELECT item_name, hsn_code, gst_percent_loose, gst_percent_packed FROM items
    ON CONFLICT (item_name) DO NOTHING
    RETURNING id, item_name
), tobacco AS (
    INSERT INTO categories (tenant_id, category_name, description, status)
    SELECT id, 'Tobacco', 'Cigarettes, bidi, tobacco, pan masala', 'active' FROM tenants
    ON CONFLICT (tenant_id, category_name) DO NOTHING
    RETURNING id, tenant_id, category_name
), cats AS (
    SELECT id, tenant_id, category_name FROM categories
    UNION ALL
    SELECT id, tenant_id, category_name FROM tobacco
)
INSERT INTO category_gst_items (tenant_id, category_id, gst_item_id)
SELECT c.tenant_id, c.id, ins.id
FROM items i
JOIN ins ON ins.item_name = i.item_name
JOIN cats c ON c.category_name = i.category_name
ON CONFLICT (tenant_id, gst_item_id) DO NOTHING;

-- Specific categories added by migration 015 duplicate the GST items; remove the unused ones
DELETE FROM categories c
WHERE c.category_name IN (
    'Rice', 'Wheat', 'Atta & Flours', 'Suji, Rava & Dalia', 'Besan & Pulse Flours', 'Dal & Pulses',
    'Sugar', 'Jaggery', 'Salt', 'Edible Oils', 'Spices & Masala', 'Dry Fruits & Nuts',
    'Milk', 'Curd & Buttermilk', 'Paneer', 'Cheese', 'Ghee & Butter', 'Eggs',
    'Fresh Vegetables', 'Fresh Fruits',
    'Bread, Roti & Khakhra', 'Biscuits & Cookies', 'Cakes & Pastries', 'Namkeen & Snacks',
    'Noodles & Pasta', 'Breakfast Cereals', 'Chocolates', 'Sweets & Confectionery', 'Ice Cream',
    'Jams, Sauces & Ketchup',
    'Tea', 'Coffee', 'Fruit Juices', 'Packaged Drinking Water', 'Soft Drinks',
    'Toilet Soaps', 'Shampoo & Hair Oil', 'Toothpaste & Tooth Powder', 'Toothbrushes',
    'Talcum & Face Powder', 'Shaving Products', 'Sanitary Napkins',
    'Baby Diapers', 'Feeding Bottles',
    'Detergents', 'Floor & Toilet Cleaners', 'Mosquito Repellents', 'Agarbatti & Dhoop', 'Candles',
    'Matchboxes', 'Kitchenware & Utensils', 'Batteries',
    'Notebooks', 'Pencils & Crayons', 'Pens',
    'Cigarettes & Tobacco'
)
AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id);

-- HSN and GST % now come from the GST item, not the category
ALTER TABLE categories DROP CONSTRAINT IF EXISTS chk_categories_hsn_code;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS chk_categories_gst_percent;
ALTER TABLE categories DROP COLUMN IF EXISTS hsn_code;
ALTER TABLE categories DROP COLUMN IF EXISTS gst_percent_loose;
ALTER TABLE categories DROP COLUMN IF EXISTS gst_percent_packed;

-- gst_overridden: HSN or GST % on the product differs from its GST item
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_item_id INTEGER REFERENCES gst_items(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_overridden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_products_gst_item ON products(gst_item_id);

-- Link existing products to the GST item of their category with the same HSN heading.
-- When several items share the heading, the one whose rate matches the product is used;
-- products that still match none or several stay unlinked and are picked by hand
WITH cand AS (
    SELECT p.id AS product_id, g.id AS gst_item_id,
           p.tax_percent = CASE WHEN p.product_type = 'loose'
                                THEN g.gst_percent_loose ELSE g.gst_percent_packed END AS rate_match
    FROM products p
    JOIN category_gst_items cg ON cg.category_id = p.category_id AND cg.tenant_id = p.tenant_id
    JOIN gst_items g ON g.id = cg.gst_item_id AND p.hsn_code LIKE g.hsn_code || '%'
    WHERE p.gst_item_id IS NULL
), pick AS (
    SELECT product_id,
           CASE WHEN COUNT(*) = 1 THEN MIN(gst_item_id)
                WHEN COUNT(*) FILTER (WHERE rate_match) = 1 THEN MIN(gst_item_id) FILTER (WHERE rate_match)
           END AS gst_item_id
    FROM cand GROUP BY product_id
)
UPDATE products p SET gst_item_id = pick.gst_item_id
FROM pick
WHERE pick.product_id = p.id AND pick.gst_item_id IS NOT NULL;

UPDATE products p
SET gst_overridden = NOT (p.hsn_code LIKE g.hsn_code || '%'
    AND COALESCE(p.tax_percent, 0) = CASE WHEN p.product_type = 'loose'
                                          THEN g.gst_percent_loose ELSE g.gst_percent_packed END)
FROM gst_items g
WHERE g.id = p.gst_item_id;
