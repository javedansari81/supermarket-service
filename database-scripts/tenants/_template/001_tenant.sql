-- =====================================================
-- Tenant template - copy this folder to tenants/<TENANT_CODE>/ and replace:
--   __TENANT_CODE__   e.g. SFM003
--   __TENANT_NAME__   e.g. Warsi Mart Branch 2
--   __SUBDOMAIN__     e.g. store3 (for store3.mfmart.co.in), lowercase letters, digits, hyphens
-- Folders starting with "_" are never deployed.
-- Scripts are immutable once deployed; later changes go in a new numbered file.
-- =====================================================

SET search_path TO mart, public;

INSERT INTO tenants (tenant_code, tenant_name, address, contact_no, email, gst_no, subdomain, status)
VALUES (
    '__TENANT_CODE__',
    '__TENANT_NAME__',
    NULL,
    NULL,
    NULL,
    NULL,
    '__SUBDOMAIN__',
    'active'
)
ON CONFLICT (tenant_code) DO NOTHING;

SELECT setup_tenant_defaults('__TENANT_CODE__');
