-- =====================================================
-- Supermarket Management System - Cashier shifts and cash drawer reconciliation
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- One shared cash drawer per store; at most one shift is open at a time.
-- Closing records the note-by-note count (denominations: {"500": 3, ...}), the expected cash
-- worked out by the server and the difference; differences above the store limit need approval.
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_no VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opening_float DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
    opened_by INTEGER REFERENCES users(id),
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by INTEGER REFERENCES users(id),
    closed_at TIMESTAMP,
    denominations JSONB,
    counted_cash DECIMAL(12, 2),
    expected_cash DECIMAL(12, 2),
    difference DECIMAL(12, 2),
    close_note TEXT,
    -- 'pending' when the difference is above the limit, then 'approved'; NULL when not needed
    approval_status VARCHAR(20) CHECK (approval_status IN ('pending', 'approved')),
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    approval_note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cashier_shifts_tenant_no UNIQUE (tenant_id, shift_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_one_open ON cashier_shifts(tenant_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_tenant_opened ON cashier_shifts(tenant_id, opened_at);

-- Cash added to (in) or taken out of (out) the drawer during a shift, e.g. change brought in,
-- shop expenses paid, cash moved to the safe
CREATE TABLE IF NOT EXISTS shift_cash_movements (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id INTEGER NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('in', 'out')),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    reason VARCHAR(200) NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shift ON shift_cash_movements(shift_id);

-- Shift the bill / return was made in; a void takes its cash out of the shift open at the time
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES cashier_shifts(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_shift_id INTEGER REFERENCES cashier_shifts(id);
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES cashier_shifts(id);

CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_void_shift ON sales(void_shift_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_shift ON sale_returns(shift_id);
