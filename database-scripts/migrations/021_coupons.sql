-- =====================================================
-- Supermarket Management System - Coupon codes (bill discounts at checkout)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- A coupon is valid from start_date to end_date (inclusive, store calendar days) while active.
-- 'percent' off each line (optionally capped by max_discount) or 'amount' (Rs) off the bill.
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(30) NOT NULL,
    description VARCHAR(200),
    discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'amount')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    max_discount NUMERIC(10, 2) CHECK (max_discount IS NULL OR max_discount > 0),
    min_bill_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_bill_amount >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    per_customer_limit INTEGER CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date >= start_date),
    CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_tenant_code ON coupons(tenant_id, UPPER(code));

-- Coupon used on a sale (lines it won have discount_source = 'coupon'); code kept as billed
ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(30);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sales_coupon ON sales(coupon_id) WHERE coupon_id IS NOT NULL;

-- Coupon entered on a parked bill; checked again at checkout
ALTER TABLE held_bills ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(30);
