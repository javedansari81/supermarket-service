-- =====================================================
-- Supermarket Management System - Store locations as floor / rack / shelf
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Location type is now the rack purpose: display (D01), storage (S01) or promo (P01)
ALTER TABLE store_locations DROP CONSTRAINT IF EXISTS store_locations_location_type_check;

ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS floor VARCHAR(20) NOT NULL DEFAULT 'Ground';
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS rack_no VARCHAR(10);
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS shelf_no VARCHAR(5);

UPDATE store_locations
SET location_type = CASE WHEN location_type = 'backroom' THEN 'storage' ELSE 'display' END,
    rack_no = LEFT(location_code, 10)
WHERE rack_no IS NULL;

ALTER TABLE store_locations ALTER COLUMN rack_no SET NOT NULL;
ALTER TABLE store_locations ALTER COLUMN location_type SET DEFAULT 'display';
ALTER TABLE store_locations ADD CONSTRAINT store_locations_location_type_check
    CHECK (location_type IN ('display', 'storage', 'promo'));

DROP INDEX IF EXISTS idx_store_locations_parent;
ALTER TABLE store_locations DROP COLUMN IF EXISTS parent_id;
ALTER TABLE store_locations DROP COLUMN IF EXISTS location_name;

CREATE INDEX IF NOT EXISTS idx_store_locations_rack ON store_locations(tenant_id, rack_no);

-- A product's role follows the type of the location it is assigned to
UPDATE product_locations pl
SET role = sl.location_type
FROM store_locations sl
WHERE sl.id = pl.location_id AND pl.role <> sl.location_type;

-- Keep one primary per product and role
UPDATE product_locations pl
SET is_primary = FALSE
WHERE pl.is_primary AND EXISTS (
    SELECT 1 FROM product_locations other
    WHERE other.product_id = pl.product_id AND other.role = pl.role
      AND other.is_primary AND other.id < pl.id
);
