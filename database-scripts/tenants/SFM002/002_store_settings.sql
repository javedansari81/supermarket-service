-- =====================================================
-- Tenant SFM002 - Store details printed on invoices
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description)
SELECT t.id, s.setting_key, s.setting_value, 'string', s.description
FROM tenants t
CROSS JOIN (VALUES
    ('store_name', 'Warsi Family Mart', 'Store name for invoices'),
    ('store_address', '', 'Store address'),
    ('store_phone', '', 'Store contact number'),
    ('store_email', '', 'Store email'),
    ('gstin', '', 'GST identification number'),
    ('store_state', '', 'State of the store (place of supply)'),
    ('fssai_license', '', 'FSSAI licence number'),
    ('invoice_prefix', 'WFM', 'Invoice number prefix')
) AS s (setting_key, setting_value, description)
WHERE t.tenant_code = 'SFM002'
ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = CURRENT_TIMESTAMP;
