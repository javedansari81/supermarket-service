-- =====================================================
-- Supermarket Management System - One code per unit
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Units use the same code everywhere: g, kg, ml, L, pcs, pages
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_net_unit;

UPDATE products SET net_unit = 'L' WHERE net_unit = 'l';
UPDATE products SET unit_type = 'L' WHERE unit_type IN ('l', 'ltr');
UPDATE sale_items SET unit_type = 'L' WHERE unit_type IN ('l', 'ltr');
UPDATE sale_return_items SET unit_type = 'L' WHERE unit_type IN ('l', 'ltr');

-- Packed items are sold per piece (pack, box, bottle, dozen -> pcs); a dozen is a pack of 12 pcs
UPDATE products SET net_quantity = 12, net_unit = 'pcs'
WHERE product_type <> 'loose' AND unit_type = 'dozen' AND net_quantity IS NULL;
UPDATE products SET unit_type = 'pcs'
WHERE product_type <> 'loose' AND unit_type IS DISTINCT FROM 'pcs';

ALTER TABLE products ADD CONSTRAINT chk_products_net_unit
    CHECK (net_unit IS NULL OR net_unit IN ('g', 'kg', 'ml', 'L', 'pcs', 'pages'));

UPDATE unit_types SET unit_code = 'L' WHERE unit_code = 'l';
DELETE FROM unit_types WHERE unit_code IN ('box', 'pack', 'dozen');
INSERT INTO unit_types (unit_code, unit_name, description) VALUES
    ('pages', 'Pages', 'Number of pages, e.g. notebooks')
ON CONFLICT (unit_code) DO NOTHING;
