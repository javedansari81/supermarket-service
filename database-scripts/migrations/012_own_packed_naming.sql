-- =====================================================
-- Supermarket Management System - Own-packed naming convention
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Naming convention: own-packed products carry the store brand MF and names end with "MF"
UPDATE products
SET product_name = regexp_replace(
        regexp_replace(product_name, '^[[:space:]]*MF[[:space:]]+', '', 'i'),
        '[[:space:]-]*\(?[[:space:]]*(loose|MF)[[:space:]]*\)?[[:space:]]*$', '', 'i') || ' MF',
    brand = 'MF'
WHERE product_type = 'own_packed';
