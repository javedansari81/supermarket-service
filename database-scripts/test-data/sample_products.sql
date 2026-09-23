-- =====================================================
-- Supermarket Management System - Sample Products (TESTING ONLY)
-- Schema: mart
-- Not part of deploy.py; run manually on a test database.
-- Safe to re-run: skips products whose name already exists for the tenant.
-- Stock starts at 0; add stock through Purchases.
-- Remove later with:
--   UPDATE mart.products SET status = 'inactive' WHERE description = 'SAMPLE-TEST-DATA';
-- =====================================================

SET search_path TO mart, public;

DO $$
DECLARE
    v_tenant_id INTEGER;
    v_admin_id INTEGER;
    v_last_no INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE tenant_code = 'SFM001';
    SELECT id INTO v_admin_id FROM users WHERE tenant_id = v_tenant_id AND username = 'admin';

    SELECT COALESCE(MAX(SUBSTRING(product_no FROM 2)::INTEGER), 0) INTO v_last_no
    FROM products WHERE tenant_id = v_tenant_id AND product_no ~ '^P[0-9]+$';

    WITH src (category_name, product_name, brand, unit_type, is_loose, hsn_code, tax_percent,
              purchase_price, mrp, selling_price, reorder_level) AS (VALUES
        -- Groceries: loose (price per kg)
        ('Groceries', 'Sugar (Loose)', NULL, 'kg', TRUE, '1701', 5, 40.00, NULL, 46.00, 20),
        ('Groceries', 'Rice Sona Masoori (Loose)', NULL, 'kg', TRUE, '1006', 0, 48.00, NULL, 56.00, 25),
        ('Groceries', 'Wheat (Loose)', NULL, 'kg', TRUE, '1001', 0, 28.00, NULL, 34.00, 25),
        ('Groceries', 'Toor Dal (Loose)', NULL, 'kg', TRUE, '0713', 0, 120.00, NULL, 140.00, 10),
        ('Groceries', 'Chana Dal (Loose)', NULL, 'kg', TRUE, '0713', 0, 70.00, NULL, 85.00, 10),
        ('Groceries', 'Besan (Loose)', NULL, 'kg', TRUE, '1106', 0, 70.00, NULL, 90.00, 5),
        -- Groceries: packed
        ('Groceries', 'Whole Wheat Atta 5 kg', 'Aashirvaad', 'pcs', FALSE, '1101', 5, 210.00, 265.00, 255.00, 5),
        ('Groceries', 'Iodised Salt 1 kg', 'Tata', 'pcs', FALSE, '2501', 0, 22.00, 28.00, 28.00, 10),
        ('Groceries', 'Sunflower Oil 1 L', 'Fortune', 'pcs', FALSE, '1512', 5, 125.00, 155.00, 150.00, 10),
        ('Groceries', 'Basmati Rice 1 kg', 'India Gate', 'pcs', FALSE, '1006', 5, 110.00, 150.00, 140.00, 5),
        ('Groceries', 'Turmeric Powder 100 g', 'Everest', 'pcs', FALSE, '0910', 5, 25.00, 35.00, 34.00, 10),
        -- Beverages
        ('Beverages', 'Tea Gold 250 g', 'Tata', 'pcs', FALSE, '0902', 5, 120.00, 155.00, 150.00, 5),
        ('Beverages', 'Instant Coffee 50 g', 'Bru', 'pcs', FALSE, '0901', 5, 100.00, 130.00, 125.00, 5),
        ('Beverages', 'Coca-Cola 750 ml', 'Coca-Cola', 'pcs', FALSE, '2202', 40, 32.00, 45.00, 45.00, 12),
        ('Beverages', 'Packaged Drinking Water 1 L', 'Bisleri', 'pcs', FALSE, '2201', 5, 12.00, 20.00, 20.00, 24),
        ('Beverages', 'Mixed Fruit Juice 1 L', 'Real', 'pcs', FALSE, '2009', 5, 90.00, 125.00, 120.00, 6),
        -- Dairy Products
        ('Dairy Products', 'Taaza Toned Milk 500 ml', 'Amul', 'pcs', FALSE, '0401', 0, 25.00, 28.00, 28.00, 20),
        ('Dairy Products', 'Butter 100 g', 'Amul', 'pcs', FALSE, '0405', 5, 50.00, 62.00, 60.00, 10),
        ('Dairy Products', 'Fresh Paneer 200 g', 'Amul', 'pcs', FALSE, '0406', 0, 75.00, 95.00, 90.00, 5),
        ('Dairy Products', 'Dahi 400 g', 'Nestle', 'pcs', FALSE, '0403', 5, 32.00, 40.00, 40.00, 10),
        ('Dairy Products', 'Eggs Tray of 30', NULL, 'pcs', FALSE, '0407', 0, 150.00, 190.00, 180.00, 5),
        -- Snacks
        ('Snacks', 'Parle-G Biscuits 250 g', 'Parle', 'pcs', FALSE, '1905', 5, 20.00, 25.00, 25.00, 20),
        ('Snacks', 'Classic Salted Chips 52 g', 'Lay''s', 'pcs', FALSE, '2005', 5, 15.00, 20.00, 20.00, 20),
        ('Snacks', 'Aloo Bhujia 200 g', 'Haldiram''s', 'pcs', FALSE, '2106', 5, 45.00, 60.00, 58.00, 10),
        ('Snacks', 'Dairy Milk Chocolate 50 g', 'Cadbury', 'pcs', FALSE, '1806', 5, 35.00, 45.00, 45.00, 10),
        -- Personal Care
        ('Personal Care', 'Total Soap 100 g', 'Lifebuoy', 'pcs', FALSE, '3401', 5, 25.00, 35.00, 33.00, 12),
        ('Personal Care', 'Shampoo 175 ml', 'Clinic Plus', 'pcs', FALSE, '3305', 5, 90.00, 120.00, 115.00, 6),
        ('Personal Care', 'Strong Teeth Toothpaste 200 g', 'Colgate', 'pcs', FALSE, '3306', 5, 90.00, 120.00, 115.00, 6),
        ('Personal Care', 'Toothbrush Medium', 'Colgate', 'pcs', FALSE, '9603', 5, 20.00, 30.00, 30.00, 10),
        -- Household
        ('Household', 'Easy Wash Detergent 1 kg', 'Surf Excel', 'pcs', FALSE, '3402', 18, 110.00, 140.00, 135.00, 6),
        ('Household', 'Toilet Cleaner 500 ml', 'Harpic', 'pcs', FALSE, '3402', 18, 85.00, 105.00, 100.00, 6),
        ('Household', 'Mosquito Repellent Refill', 'Good Knight', 'pcs', FALSE, '3808', 18, 65.00, 85.00, 85.00, 6),
        ('Household', 'Agarbatti Pack', 'Mangaldeep', 'pcs', FALSE, '3307', 5, 40.00, 55.00, 50.00, 6),
        -- Frozen Foods
        ('Frozen Foods', 'Vanilla Ice Cream 1 L', 'Amul', 'pcs', FALSE, '2105', 5, 150.00, 199.00, 190.00, 4),
        ('Frozen Foods', 'French Fries 420 g', 'McCain', 'pcs', FALSE, '2004', 5, 90.00, 120.00, 115.00, 4),
        -- Bakery
        ('Bakery', 'White Bread 400 g', 'Britannia', 'pcs', FALSE, '1905', 0, 35.00, 45.00, 45.00, 10),
        ('Bakery', 'Toast Rusk 300 g', 'Britannia', 'pcs', FALSE, '1905', 5, 40.00, 55.00, 52.00, 6),
        -- Fruits & Vegetables: loose (price per kg)
        ('Fruits & Vegetables', 'Onion', NULL, 'kg', TRUE, '0703', 0, 30.00, NULL, 40.00, 20),
        ('Fruits & Vegetables', 'Potato', NULL, 'kg', TRUE, '0701', 0, 20.00, NULL, 30.00, 20),
        ('Fruits & Vegetables', 'Tomato', NULL, 'kg', TRUE, '0702', 0, 25.00, NULL, 35.00, 10),
        ('Fruits & Vegetables', 'Apple', NULL, 'kg', TRUE, '0808', 0, 120.00, NULL, 160.00, 5),
        -- Meat & Seafood
        ('Meat & Seafood', 'Chicken (Fresh)', NULL, 'kg', TRUE, '0207', 0, 180.00, NULL, 240.00, 5),
        -- Baby Products
        ('Baby Products', 'Baby Diapers M 20 pcs', 'Pampers', 'pcs', FALSE, '9619', 5, 280.00, 369.00, 350.00, 3),
        ('Baby Products', 'Cerelac Wheat Apple 300 g', 'Nestle', 'pcs', FALSE, '1901', 5, 180.00, 230.00, 225.00, 3),
        -- Health & Wellness
        ('Health & Wellness', 'Chyawanprash 500 g', 'Dabur', 'pcs', FALSE, '3004', 5, 180.00, 235.00, 225.00, 3),
        ('Health & Wellness', 'Sanitary Napkins XL 7 pcs', 'Whisper', 'pcs', FALSE, '9619', 0, 70.00, 95.00, 90.00, 5),
        -- Stationery
        ('Stationery', 'Notebook 172 Pages', 'Classmate', 'pcs', FALSE, '4820', 0, 40.00, 55.00, 50.00, 10),
        ('Stationery', 'Ball Pen Blue', 'Reynolds', 'pcs', FALSE, '9608', 18, 8.00, 10.00, 10.00, 20),
        -- Pet Supplies
        ('Pet Supplies', 'Adult Dog Food 1.2 kg', 'Pedigree', 'pcs', FALSE, '2309', 18, 280.00, 360.00, 345.00, 3)
    ),
    new_items AS (
        SELECT s.*, c.id AS category_id,
               ROW_NUMBER() OVER (ORDER BY c.id, s.product_name) AS rn
        FROM src s
        JOIN categories c ON c.tenant_id = v_tenant_id
                         AND c.category_name = s.category_name
                         AND c.status = 'active'
        WHERE NOT EXISTS (
            SELECT 1 FROM products p
            WHERE p.tenant_id = v_tenant_id AND LOWER(p.product_name) = LOWER(s.product_name)
        )
    )
    INSERT INTO products (tenant_id, product_no, product_name, category_id, brand, unit_type,
                          is_loose, hsn_code, tax_percent, purchase_price, mrp, selling_price,
                          stock_quantity, reorder_level, description, status, created_by)
    SELECT v_tenant_id, 'P' || LPAD((v_last_no + rn)::TEXT, 5, '0'), product_name, category_id,
           brand, unit_type, is_loose, hsn_code, tax_percent, purchase_price, mrp, selling_price,
           0, reorder_level, 'SAMPLE-TEST-DATA', 'active', v_admin_id
    FROM new_items;

    -- In-store EAN-13 barcode: '2' + product id (11 digits) + check digit, same as the API
    UPDATE products p
    SET barcode = b.code12 || ((10 - (
            (SELECT SUM(SUBSTRING(b.code12, i, 1)::INTEGER * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
             FROM generate_series(1, 12) AS i)
        % 10)) % 10)::TEXT
    FROM (SELECT id, '2' || LPAD(id::TEXT, 11, '0') AS code12
          FROM products
          WHERE tenant_id = v_tenant_id AND barcode IS NULL AND description = 'SAMPLE-TEST-DATA') b
    WHERE p.id = b.id;
END $$;
