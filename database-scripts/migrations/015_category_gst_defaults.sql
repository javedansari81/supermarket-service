-- =====================================================
-- Supermarket Management System - Category HSN and GST defaults
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Filled into the product form when the category is chosen.
-- Loose = sold loose / weighed; packed = pre-packaged and labelled
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS gst_percent_loose DECIMAL(5, 2);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS gst_percent_packed DECIMAL(5, 2);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS chk_categories_hsn_code;
ALTER TABLE categories ADD CONSTRAINT chk_categories_hsn_code
    CHECK (hsn_code IS NULL OR hsn_code ~ '^[0-9]{4,8}$');
ALTER TABLE categories DROP CONSTRAINT IF EXISTS chk_categories_gst_percent;
ALTER TABLE categories ADD CONSTRAINT chk_categories_gst_percent
    CHECK ((gst_percent_loose IS NULL OR gst_percent_loose BETWEEN 0 AND 100)
       AND (gst_percent_packed IS NULL OR gst_percent_packed BETWEEN 0 AND 100));

-- Rates as per Notification 9/2025-Central Tax (Rate), effective 22 Sep 2025
WITH defaults (category_name, description, hsn_code, gst_percent_loose, gst_percent_packed) AS (
    VALUES
    -- Staples
    ('Rice', 'Rice, poha, basmati', '1006', 0, 5),
    ('Wheat', 'Whole wheat', '1001', 0, 5),
    ('Atta & Flours', 'Wheat atta, maida', '1101', 0, 5),
    ('Suji, Rava & Dalia', 'Suji, rava, dalia', '1103', 0, 5),
    ('Besan & Pulse Flours', 'Besan, other pulse flours', '1106', 0, 5),
    ('Dal & Pulses', 'Toor, moong, chana, urad, rajma', '0713', 0, 5),
    ('Sugar', 'Sugar, khandsari', '1701', 5, 5),
    ('Jaggery', 'Gur, jaggery', '1701', 0, 5),
    ('Salt', 'Common and rock salt', '2501', 0, 0),
    ('Edible Oils', 'Groundnut, mustard, sunflower, soybean oil', '1508', 5, 5),
    ('Spices & Masala', 'Whole and ground spices, masala powders', '0910', 5, 5),
    ('Dry Fruits & Nuts', 'Almonds, cashews, raisins, walnuts', '0802', 5, 5),
    -- Dairy and eggs
    ('Milk', 'Fresh, pasteurised and UHT milk', '0401', 0, 0),
    ('Curd & Buttermilk', 'Curd, dahi, lassi, buttermilk', '0403', 0, 5),
    ('Paneer', 'Paneer, chena', '0406', 0, 0),
    ('Cheese', 'Cheese slices, cubes, spreads', '0406', 5, 5),
    ('Ghee & Butter', 'Ghee, butter', '0405', 5, 5),
    ('Eggs', 'Eggs', '0407', 0, 0),
    -- Fresh produce
    ('Fresh Vegetables', 'Fresh vegetables', '0709', 0, 0),
    ('Fresh Fruits', 'Fresh fruits', '0810', 0, 0),
    -- Bakery and packaged food
    ('Bread, Roti & Khakhra', 'Bread, pizza bread, roti, paratha, khakhra', '1905', 0, 0),
    ('Biscuits & Cookies', 'Biscuits, cookies, rusk', '1905', 5, 5),
    ('Cakes & Pastries', 'Cakes, pastries', '1905', 5, 5),
    ('Namkeen & Snacks', 'Namkeen, bhujia, mixture', '2106', 5, 5),
    ('Noodles & Pasta', 'Instant noodles, pasta, vermicelli', '1902', 5, 5),
    ('Breakfast Cereals', 'Cornflakes, muesli, oats', '1904', 5, 5),
    ('Chocolates', 'Chocolates, cocoa products', '1806', 5, 5),
    ('Sweets & Confectionery', 'Candies, toffees, sugar confectionery', '1704', 5, 5),
    ('Ice Cream', 'Ice cream, kulfi, frozen desserts', '2105', 5, 5),
    ('Jams, Sauces & Ketchup', 'Jams, sauces, ketchup', '2103', 5, 5),
    -- Beverages
    ('Tea', 'Tea leaves, tea bags', '0902', 5, 5),
    ('Coffee', 'Coffee beans, powder, instant coffee', '0901', 5, 5),
    ('Fruit Juices', 'Fruit and vegetable juices', '2009', 5, 5),
    ('Packaged Drinking Water', 'Bottled water', '2201', 5, 5),
    ('Soft Drinks', 'Aerated and sugary drinks', '2202', 40, 40),
    -- Personal care
    ('Toilet Soaps', 'Bath soaps', '3401', 5, 5),
    ('Shampoo & Hair Oil', 'Shampoo, hair oil', '3305', 5, 5),
    ('Toothpaste & Tooth Powder', 'Toothpaste, tooth powder, dental floss', '3306', 5, 5),
    ('Toothbrushes', 'Toothbrushes', '9603', 5, 5),
    ('Talcum & Face Powder', 'Talcum powder, face powder', '3304', 5, 5),
    ('Shaving Products', 'Shaving cream, shaving lotion, aftershave', '3307', 5, 5),
    ('Sanitary Napkins', 'Sanitary napkins, pads', '9619', 0, 0),
    -- Baby care
    ('Baby Diapers', 'Baby diapers, baby napkins', '9619', 5, 5),
    ('Feeding Bottles', 'Feeding bottles', '3926', 5, 5),
    -- Household
    ('Detergents', 'Washing powder, liquid detergent, dishwash', '3402', 18, 18),
    ('Floor & Toilet Cleaners', 'Floor, toilet and surface cleaners', '3402', 18, 18),
    ('Mosquito Repellents', 'Coils, vaporisers, sprays', '3808', 18, 18),
    ('Agarbatti & Dhoop', 'Agarbatti, dhoop, sambrani', '3307', 5, 5),
    ('Candles', 'Candles', '3406', 5, 5),
    ('Matchboxes', 'Matchboxes', '3605', 5, 5),
    ('Kitchenware & Utensils', 'Steel utensils, kitchenware, tableware', '7323', 5, 5),
    ('Batteries', 'Dry cell batteries', '8506', 18, 18),
    -- Stationery
    ('Notebooks', 'Exercise books, notebooks, graph books', '4820', 0, 0),
    ('Pencils & Crayons', 'Pencils, crayons', '9609', 0, 0),
    ('Pens', 'Ball pens, gel pens, markers', '9608', 18, 18),
    -- Tobacco
    ('Cigarettes & Tobacco', 'Cigarettes, bidi, tobacco', '2402', 40, 40)
)
INSERT INTO categories (tenant_id, category_name, description, hsn_code, gst_percent_loose, gst_percent_packed, status)
SELECT t.id, d.category_name, d.description, d.hsn_code, d.gst_percent_loose, d.gst_percent_packed, 'active'
FROM tenants t CROSS JOIN defaults d
ON CONFLICT (tenant_id, category_name) DO UPDATE SET
    hsn_code = COALESCE(categories.hsn_code, EXCLUDED.hsn_code),
    gst_percent_loose = COALESCE(categories.gst_percent_loose, EXCLUDED.gst_percent_loose),
    gst_percent_packed = COALESCE(categories.gst_percent_packed, EXCLUDED.gst_percent_packed);

-- Existing broad category with a single rate for all its items
UPDATE categories SET gst_percent_loose = 0, gst_percent_packed = 0
WHERE category_name = 'Fruits & Vegetables' AND gst_percent_loose IS NULL AND gst_percent_packed IS NULL;
