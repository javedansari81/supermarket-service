-- =====================================================
-- Supermarket Management System - Customer login by mobile OTP (online ordering)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- One login for all stores: a verified mobile number. Store data (name on invoices, loyalty
-- points, orders) stays in each store's customers row, matched on the same mobile number and
-- created at the customer's first order there (or already made at in-store billing).
CREATE TABLE IF NOT EXISTS customer_accounts (
    id SERIAL PRIMARY KEY,
    mobile VARCHAR(10) NOT NULL UNIQUE,
    customer_name VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-time login codes. Only a hash of the code is stored; a code is used once,
-- expires after a few minutes and allows a limited number of wrong attempts.
-- ip_address and created_at drive the per-number and per-IP request limits.
CREATE TABLE IF NOT EXISTS customer_otps (
    id SERIAL PRIMARY KEY,
    mobile VARCHAR(10) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    consumed_at TIMESTAMP,
    ip_address VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_otps_mobile_created ON customer_otps(mobile, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_otps_ip_created ON customer_otps(ip_address, created_at);

-- Long-lived customer sessions. Only a hash of the token is stored; each refresh
-- revokes the old token and issues a new one (rotation).
CREATE TABLE IF NOT EXISTS customer_refresh_tokens (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_refresh_tokens_account ON customer_refresh_tokens(account_id);

-- Customers can shop online only at stores where this is 'true'.
-- Demo Store (SFM001) is the pilot; other stores start switched off.
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description)
SELECT t.id, 'online_ordering_enabled', CASE WHEN t.tenant_code = 'SFM001' THEN 'true' ELSE 'false' END,
       'boolean', 'Customers can order online'
FROM tenants t
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
