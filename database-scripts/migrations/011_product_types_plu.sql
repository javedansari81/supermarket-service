-- =====================================================
-- Supermarket Management System - Product types and weighing-scale PLU codes
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- manufacturer = maker's barcode on the pack, own_packed = packed in-store with our barcode,
-- loose = weighed by the customer; the scale prints a label starting with 21
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'own_packed';
ALTER TABLE products ADD COLUMN IF NOT EXISTS plu_code INTEGER;

UPDATE products SET product_type = CASE
    WHEN is_loose THEN 'loose'
    WHEN barcode IS NULL OR barcode ~ '^2[0-9]{12}$' THEN 'own_packed'
    ELSE 'manufacturer'
END;

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_product_type;
ALTER TABLE products ADD CONSTRAINT chk_products_product_type
    CHECK (product_type IN ('manufacturer', 'own_packed', 'loose'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_loose_type;
ALTER TABLE products ADD CONSTRAINT chk_products_loose_type
    CHECK (is_loose = (product_type = 'loose'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_plu_code;
ALTER TABLE products ADD CONSTRAINT chk_products_plu_code
    CHECK (plu_code IS NULL OR plu_code BETWEEN 1 AND 99999);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_plu
    ON products (tenant_id, plu_code) WHERE plu_code IS NOT NULL;

-- Item numbers (PLU) for loose products, from 1 upwards per store
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY id) AS rn
    FROM products
    WHERE product_type = 'loose' AND plu_code IS NULL
)
UPDATE products p
SET plu_code = COALESCE((SELECT MAX(q.plu_code) FROM products q WHERE q.tenant_id = p.tenant_id), 0) + n.rn
FROM numbered n
WHERE p.id = n.id;

-- Naming convention: loose names end with "Loose" and carry no brand
UPDATE products
SET product_name = regexp_replace(product_name, '[[:space:]-]*\(?[[:space:]]*loose[[:space:]]*\)?[[:space:]]*$', '', 'i') || ' Loose',
    brand = NULL
WHERE product_type = 'loose';

-- Scale reference barcode: 21 + PLU (5 digits) + weight 00000 + EAN-13 check digit
UPDATE products p
SET barcode = b.code12 || ((10 - (
        (SELECT SUM(SUBSTRING(b.code12, i, 1)::INTEGER * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
         FROM generate_series(1, 12) AS i)
    % 10)) % 10)::TEXT
FROM (SELECT id, '21' || LPAD(plu_code::TEXT, 5, '0') || '00000' AS code12
      FROM products
      WHERE product_type = 'loose' AND plu_code IS NOT NULL
        AND (barcode IS NULL OR barcode ~ '^2[0-9]{12}$')) b
WHERE p.id = b.id;
