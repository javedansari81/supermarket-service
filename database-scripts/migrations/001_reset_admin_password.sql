-- =====================================================
-- Supermarket Management System - Reset Default Admin Password
-- Database: warsi_db
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- =====================================================
-- DEFAULT ADMIN USER FOR WARSI FAMILY MART
-- Password: admin123 (hashed with bcrypt)
-- =====================================================

UPDATE users
SET password_hash = '$2b$12$92LTE6/HOSR7PJOXbL39KOCveKVLgjuzr91dshq1c0lWsswTmr/J6', -- admin123
    updated_at = CURRENT_TIMESTAMP
WHERE username = 'admin'
  AND tenant_id = (SELECT id FROM tenants WHERE tenant_code = 'SFM001');
