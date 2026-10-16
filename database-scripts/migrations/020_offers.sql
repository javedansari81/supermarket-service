-- =====================================================
-- Supermarket Management System - Festival / promotional offers
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- An offer runs from start_date to end_date (inclusive, store calendar days) while active.
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_offers_tenant_dates ON offers(tenant_id, start_date, end_date);

-- Products in an offer: 'percent' off, or 'amount' (Rs) off per unit (per kg for loose items)
CREATE TABLE IF NOT EXISTS offer_items (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'amount')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (offer_id, product_id),
    CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_offer_items_product ON offer_items(product_id);

-- Offer applied to a sale line (discount_source = 'offer'); name kept as billed
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS offer_name VARCHAR(100);
