-- =====================================================
-- Supermarket Management System - Split payment, cash tendered and change
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Amount paid by each mode on a sale; amounts add up to sales.total_amount.
-- reference is an optional UPI transaction id or card last digits.
CREATE TABLE IF NOT EXISTS sale_payments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('cash', 'card', 'upi')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reference VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sale_payments_sale_mode UNIQUE (sale_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_tenant ON sale_payments(tenant_id);

-- Cash handed over and change returned; NULL when no cash was paid
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_tendered NUMERIC(12, 2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS change_given NUMERIC(12, 2);

-- 'split' when a sale is paid by more than one mode
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_mode_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_mode_check
    CHECK (payment_mode IN ('cash', 'card', 'upi', 'credit', 'split'));

-- One payment row per existing paid sale
INSERT INTO sale_payments (tenant_id, sale_id, mode, amount, created_at)
SELECT s.tenant_id, s.id, s.payment_mode, s.total_amount, COALESCE(s.created_at, s.sale_date)
FROM sales s
WHERE s.payment_mode IN ('cash', 'card', 'upi')
  AND s.total_amount > 0
  AND NOT EXISTS (SELECT 1 FROM sale_payments p WHERE p.sale_id = s.id);
