-- =====================================================
-- Supermarket Management System - Order updates by browser notification (Web Push)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Browsers (devices) where a customer turned on order updates. endpoint is the browser's
-- push address; p256dh and auth are its keys for encrypting messages. A device belongs to
-- the login that last turned it on; rows are removed on logout or when the browser
-- reports the address as gone.
CREATE TABLE IF NOT EXISTS customer_push_subscriptions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_push_subscriptions_account ON customer_push_subscriptions(account_id);
