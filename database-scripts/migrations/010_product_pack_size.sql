-- =====================================================
-- Supermarket Management System - Pack size of packed products
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Net quantity of one pack (e.g. 500 g, 1 kg), printed on packed-goods labels
ALTER TABLE products ADD COLUMN IF NOT EXISTS net_quantity NUMERIC(10, 3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS net_unit VARCHAR(5);

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_net_quantity;
ALTER TABLE products ADD CONSTRAINT chk_products_net_quantity
    CHECK (net_quantity IS NULL OR net_quantity > 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_net_unit;
ALTER TABLE products ADD CONSTRAINT chk_products_net_unit
    CHECK (net_unit IS NULL OR net_unit IN ('g', 'kg', 'ml', 'l', 'pcs'));
