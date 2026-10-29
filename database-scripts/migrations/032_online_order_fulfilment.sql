-- =====================================================
-- Supermarket Management System - Online order handling by store staff
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Quantity packed (weighed quantity for loose items; lower or 0 when short). Until packed,
-- the ordered quantity is held; after packing, the packed quantity.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS packed_quantity NUMERIC(12, 3)
    CHECK (packed_quantity >= 0);

-- When each step happened, and the staff member who did the last step
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
