-- =====================================================
-- Supermarket Management System - Repacking loose stock into own-packed products
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- One repack: loose stock (e.g. Toor Dal Loose, kg) packed into own-packed products
-- (Toor Dal 1 kg MF, 500 g MF, ...). Quantities are in the loose product's unit.
-- wastage_quantity is the spillage / loss recorded with the repack (0 when not recorded).
CREATE TABLE IF NOT EXISTS repacks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    repack_no VARCHAR(30) NOT NULL,
    source_product_id INTEGER NOT NULL REFERENCES products(id),
    packed_quantity DECIMAL(12, 3) NOT NULL CHECK (packed_quantity > 0),
    wastage_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    wastage_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (wastage_quantity >= 0),
    total_quantity DECIMAL(12, 3) NOT NULL CHECK (total_quantity > 0),
    -- Loose cost per unit at the time of repacking; wastage cost is spread over the packs
    source_unit_cost DECIMAL(10, 2),
    expiry_date DATE,
    remarks TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_repacks_tenant_no UNIQUE (tenant_id, repack_no)
);

CREATE INDEX IF NOT EXISTS idx_repacks_tenant_created ON repacks(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_repacks_source ON repacks(source_product_id);

CREATE TABLE IF NOT EXISTS repack_items (
    id SERIAL PRIMARY KEY,
    repack_id INTEGER NOT NULL REFERENCES repacks(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    batch_id INTEGER REFERENCES product_batches(id),
    pack_count INTEGER NOT NULL CHECK (pack_count > 0),
    -- Loose quantity used by these packs (pack size x count, in the loose unit)
    source_quantity DECIMAL(12, 3) NOT NULL CHECK (source_quantity > 0),
    unit_cost DECIMAL(10, 2)
);

CREATE INDEX IF NOT EXISTS idx_repack_items_repack ON repack_items(repack_id);

-- New stock movement types: repack_out (loose taken), repack_in (packs made), wastage_out (spillage)
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type IN (
    'purchase_in', 'sale_out', 'adjustment_in', 'adjustment_out',
    'damage_out', 'expired_out', 'return_in',
    'repack_out', 'repack_in', 'wastage_out'
));
