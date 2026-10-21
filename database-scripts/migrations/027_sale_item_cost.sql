-- =====================================================
-- Supermarket Management System - Purchase cost on bill lines
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Purchase cost per unit at the time of sale (batch cost, else product cost), used for
-- profit reports. Not filled in for older lines: profit is reported from this change on.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2);

-- Copied from the sale line being returned
ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2);
