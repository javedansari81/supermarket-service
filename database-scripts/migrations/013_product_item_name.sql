-- =====================================================
-- Supermarket Management System - Item name and generated display name
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- item_name: name without size / brand (e.g. Salt). product_name is generated from
-- item name + pack size + brand unless name_is_custom (set by hand)
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_is_custom BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing names: strip the type suffix. Packed names may already contain the size or brand,
-- so they are kept as they are (custom) until the item name is reviewed on the Products page
UPDATE products
SET item_name = regexp_replace(
        regexp_replace(product_name, '^[[:space:]]*MF[[:space:]]+', '', 'i'),
        '[[:space:]-]*\(?[[:space:]]*(loose|MF)[[:space:]]*\)?[[:space:]]*$', '', 'i'),
    name_is_custom = (product_type <> 'loose')
WHERE item_name IS NULL;
