-- =====================================================
-- Supermarket Management System - Customers by mobile number
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- One customer per 10-digit Indian mobile number per tenant
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mobile VARCHAR(10) NOT NULL,
    customer_name VARCHAR(200),
    customer_gstin VARCHAR(15),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_customers_tenant_mobile UNIQUE (tenant_id, mobile),
    CONSTRAINT chk_customers_mobile CHECK (mobile ~ '^[6-9][0-9]{9}$')
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

-- Link existing sales that carry a valid mobile number
CREATE TEMP TABLE tmp_sale_mobiles ON COMMIT DROP AS
SELECT id, tenant_id, sale_date, customer_name, customer_gstin, mobile
FROM (
    SELECT s.id, s.tenant_id, s.sale_date, s.customer_name, s.customer_gstin,
           CASE
               WHEN length(d) = 12 AND d LIKE '91%' THEN substr(d, 3)
               WHEN length(d) = 11 AND d LIKE '0%' THEN substr(d, 2)
               ELSE d
           END AS mobile
    FROM (
        SELECT sales.*, regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') AS d
        FROM sales
        WHERE customer_id IS NULL
    ) s
) t
WHERE mobile ~ '^[6-9][0-9]{9}$';

INSERT INTO customers (tenant_id, mobile, customer_name, customer_gstin, created_at, updated_at)
SELECT tenant_id, mobile,
       (ARRAY_AGG(NULLIF(TRIM(customer_name), '') ORDER BY sale_date DESC)
            FILTER (WHERE NULLIF(TRIM(customer_name), '') IS NOT NULL))[1],
       (ARRAY_AGG(customer_gstin ORDER BY sale_date DESC)
            FILTER (WHERE NULLIF(customer_gstin, '') IS NOT NULL))[1],
       MIN(sale_date), MAX(sale_date)
FROM tmp_sale_mobiles
GROUP BY tenant_id, mobile
ON CONFLICT (tenant_id, mobile) DO NOTHING;

UPDATE sales s
SET customer_id = c.id, customer_phone = t.mobile
FROM tmp_sale_mobiles t
JOIN customers c ON c.tenant_id = t.tenant_id AND c.mobile = t.mobile
WHERE s.id = t.id;
