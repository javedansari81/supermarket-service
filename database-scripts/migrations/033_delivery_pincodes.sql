-- =====================================================
-- Supermarket Management System - Online delivery area (pincodes per store)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Comma-separated 6-digit pincodes the store delivers to; empty = not delivering yet.
-- Demo Store (SFM001, the pilot) delivers to 210431 only.
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description)
SELECT t.id, 'delivery_pincodes', CASE WHEN t.tenant_code = 'SFM001' THEN '210431' ELSE '' END,
       'string', 'Pincodes for online delivery (comma-separated)'
FROM tenants t
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
