-- =====================================================
-- Supermarket Management System - Customer loyalty points
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Cached balance; loyalty_transactions is the source of truth.
-- loyalty_last_activity drives rolling expiry (balance expires after N days without earn/redeem).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_last_activity TIMESTAMP;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_points_balance_check;
ALTER TABLE customers ADD CONSTRAINT customers_points_balance_check CHECK (points_balance >= 0);

-- Every change to a customer's points. points is signed (+ credit, - debit).
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    txn_type VARCHAR(20) NOT NULL CHECK (txn_type IN
        ('earn', 'redeem', 'earn_reversal', 'redeem_refund', 'adjust', 'expire')),
    points INTEGER NOT NULL CHECK (points <> 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    return_id INTEGER REFERENCES sale_returns(id) ON DELETE SET NULL,
    remarks TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_txn_tenant ON loyalty_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_customer ON loyalty_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_sale ON loyalty_transactions(sale_id) WHERE sale_id IS NOT NULL;

-- Points earned and redeemed on a bill (redeemed value is the 'points' row in sale_payments)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0;

-- On a return: redeemed points credited back (and their Rs value, part of total_amount)
-- and earned points taken back
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS points_refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS points_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS points_reversed INTEGER NOT NULL DEFAULT 0;

-- 'points' as a payment mode
ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_mode_check;
ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_mode_check
    CHECK (mode IN ('cash', 'card', 'upi', 'points'));

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_mode_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_mode_check
    CHECK (payment_mode IN ('cash', 'card', 'upi', 'credit', 'split', 'points'));

ALTER TABLE sale_returns DROP CONSTRAINT IF EXISTS sale_returns_refund_mode_check;
ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_refund_mode_check
    CHECK (refund_mode IN ('cash', 'card', 'upi', 'points'));
