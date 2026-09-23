-- =====================================================
-- Supermarket Management System - Kirana / Loose Item Support
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Loose (weighed/measured) vs packed items, and GST HSN code
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_loose BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);

-- 3-decimal quantities so loose items can be sold in grams (e.g. 0.250 kg)
ALTER TABLE products ALTER COLUMN stock_quantity TYPE DECIMAL(12, 3);
ALTER TABLE products ALTER COLUMN reorder_level TYPE DECIMAL(12, 3);
ALTER TABLE sale_items ALTER COLUMN quantity TYPE DECIMAL(12, 3);
ALTER TABLE purchase_items ALTER COLUMN quantity TYPE DECIMAL(12, 3);
ALTER TABLE stock_movements ALTER COLUMN quantity TYPE DECIMAL(12, 3);

-- Selling price must never exceed MRP (Legal Metrology rule)
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_price_le_mrp;
ALTER TABLE products ADD CONSTRAINT chk_products_price_le_mrp
    CHECK (mrp IS NULL OR selling_price IS NULL OR selling_price <= mrp) NOT VALID;
