-- =====================================================
-- Supermarket Management System - SFM001 becomes the Demo Store
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- SFM001 holds the test data and is served at demo-store.mfmart.co.in
UPDATE tenants
SET tenant_name = 'Demo Store',
    subdomain = 'demo-store',
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_code = 'SFM001';

UPDATE tenant_settings
SET setting_value = 'Demo Store',
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'store_name'
  AND tenant_id = (SELECT id FROM tenants WHERE tenant_code = 'SFM001');
