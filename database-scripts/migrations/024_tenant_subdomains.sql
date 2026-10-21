-- =====================================================
-- Supermarket Management System - Store subdomains
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Subdomain label under the base domain, e.g. 'store1' for store1.mfmart.co.in.
-- NULL means the store has no subdomain of its own.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subdomain VARCHAR(63);
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subdomain_key;
ALTER TABLE tenants ADD CONSTRAINT tenants_subdomain_key UNIQUE (subdomain);
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subdomain_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subdomain_check
    CHECK (subdomain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
