-- =====================================================
-- Supermarket Management System - Store payment accounts (UPI ID, Razorpay keys)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- One row per store; read and changed by that store's admins only (never through the general
-- settings list). Razorpay is not used yet: its keys are kept for later. Secrets are stored
-- encrypted with the server's PAYMENT_ENCRYPTION_KEY, never in plain text.
CREATE TABLE IF NOT EXISTS tenant_payment_settings (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    upi_id VARCHAR(100) NOT NULL DEFAULT '',
    upi_payee_name VARCHAR(50) NOT NULL DEFAULT '',
    razorpay_key_id VARCHAR(50) NOT NULL DEFAULT '',
    razorpay_key_secret_encrypted TEXT,
    razorpay_webhook_secret_encrypted TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UPI ID and payee name were briefly kept in tenant_settings; move them here
INSERT INTO tenant_payment_settings (tenant_id, upi_id, upi_payee_name)
SELECT t.id,
       COALESCE((SELECT s.setting_value FROM tenant_settings s
                 WHERE s.tenant_id = t.id AND s.setting_key = 'upi_id'), ''),
       COALESCE((SELECT s.setting_value FROM tenant_settings s
                 WHERE s.tenant_id = t.id AND s.setting_key = 'upi_payee_name'), '')
FROM tenants t
WHERE EXISTS (SELECT 1 FROM tenant_settings s WHERE s.tenant_id = t.id
              AND s.setting_key IN ('upi_id', 'upi_payee_name') AND COALESCE(s.setting_value, '') <> '')
ON CONFLICT (tenant_id) DO NOTHING;

DELETE FROM tenant_settings WHERE setting_key IN ('upi_id', 'upi_payee_name');
