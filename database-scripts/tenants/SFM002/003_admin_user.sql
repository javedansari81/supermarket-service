-- =====================================================
-- Tenant SFM002 - First admin user
-- Password: admin123 (bcrypt) - change it after the first login
-- =====================================================

SET search_path TO mart, public;

INSERT INTO users (tenant_id, role_id, username, email, password_hash, full_name, status)
SELECT t.id, r.id, 'warsi_admin', NULL,
       '$2b$12$92LTE6/HOSR7PJOXbL39KOCveKVLgjuzr91dshq1c0lWsswTmr/J6', -- admin123
       'Warsi Store Administrator', 'active'
FROM tenants t
JOIN roles r ON r.role_name = 'admin'
WHERE t.tenant_code = 'SFM002'
ON CONFLICT (tenant_id, username) DO NOTHING;
