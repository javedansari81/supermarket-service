-- =====================================================
-- Supermarket Management System - Held (parked) bills
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- A cart parked at the counter; stock is not reserved until checkout
CREATE TABLE IF NOT EXISTS held_bills (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    label VARCHAR(100),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    item_count INTEGER NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_held_bills_tenant_user ON held_bills(tenant_id, created_by);
