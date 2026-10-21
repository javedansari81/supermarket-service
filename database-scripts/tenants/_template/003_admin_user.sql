-- =====================================================
-- Tenant template - First admin user
-- Replace __TENANT_CODE__, __ADMIN_USERNAME__ and __ADMIN_FULL_NAME__.
-- Use a username not used by another store's admin.
-- Password: admin123 (bcrypt) - change it after the first login
-- =====================================================

SET search_path TO mart, public;

INSERT INTO users (tenant_id, role_id, username, email, password_hash, full_name, status)
SELECT t.id, r.id, '__ADMIN_USERNAME__', NULL,
       '$2b$12$92LTE6/HOSR7PJOXbL39KOCveKVLgjuzr91dshq1c0lWsswTmr/J6', -- admin123
       '__ADMIN_FULL_NAME__', 'active'
FROM tenants t
JOIN roles r ON r.role_name = 'admin'
WHERE t.tenant_code = '__TENANT_CODE__'
ON CONFLICT (tenant_id, username) DO NOTHING;
