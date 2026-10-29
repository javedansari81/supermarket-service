-- =====================================================
-- Supermarket Management System - Product images (shop website and staff app)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Object storage key without extension; files are <key>.webp (800 px) and <key>_thumb.webp
-- (320 px). A new key is made for every upload, so cached images never go stale.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_key VARCHAR(300);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMP;
