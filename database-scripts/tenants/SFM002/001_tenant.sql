-- =====================================================
-- Tenant SFM002 - Warsi Family Mart (warsi-store.mfmart.co.in)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

INSERT INTO tenants (tenant_code, tenant_name, address, contact_no, email, gst_no, subdomain, status)
VALUES (
    'SFM002',
    'Warsi Family Mart',
    NULL,
    NULL,
    NULL,
    NULL,
    'warsi-store',
    'active'
)
ON CONFLICT (tenant_code) DO NOTHING;

SELECT setup_tenant_defaults('SFM002');
