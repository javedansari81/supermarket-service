-- =====================================================
-- Supermarket Management System - Supplier bill attachment on purchases
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- File stored in Cloudflare R2; bill_file_key is the object key in the bucket
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_file_key VARCHAR(300);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_file_name VARCHAR(255);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_content_type VARCHAR(100);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_uploaded_at TIMESTAMP;
