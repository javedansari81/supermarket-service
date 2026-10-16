-- =====================================================
-- Supermarket Management System - Near-expiry (clearance) discounts
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Discount tiers by days left to expiry, for packed batches.
-- Scope: store default (no category, no product), a category, or a product.
-- tiers: [{"days_left": 30, "percent": 10}, ...]; an empty list means no discount.
CREATE TABLE IF NOT EXISTS clearance_rules (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (category_id IS NULL OR product_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clearance_rules_default
    ON clearance_rules(tenant_id) WHERE category_id IS NULL AND product_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clearance_rules_category
    ON clearance_rules(tenant_id, category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clearance_rules_product
    ON clearance_rules(tenant_id, product_id) WHERE product_id IS NOT NULL;

-- Store default tiers for existing stores (applied only once clearance is switched on)
INSERT INTO clearance_rules (tenant_id, tiers)
SELECT t.id, '[{"days_left": 30, "percent": 10}, {"days_left": 15, "percent": 20}, {"days_left": 7, "percent": 30}]'::jsonb
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM clearance_rules r
    WHERE r.tenant_id = t.id AND r.category_id IS NULL AND r.product_id IS NULL
);

-- Daily markdown for loose items (fruits, vegetables), valid until markdown_until (UTC)
ALTER TABLE products ADD COLUMN IF NOT EXISTS markdown_percent NUMERIC(5, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS markdown_until TIMESTAMP;

-- Where a sale line's discount came from: 'manual' or 'clearance'
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_source VARCHAR(20);
