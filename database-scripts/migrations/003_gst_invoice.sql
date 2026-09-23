-- =====================================================
-- Supermarket Management System - GST Tax Invoice Support
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Per-line GST details (snapshot at the time of sale)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS mrp DECIMAL(10, 2);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(10, 2) DEFAULT 0;

-- Buyer GSTIN (B2B), place of supply and tax split on the sale
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(12, 2) DEFAULT 0;

-- Invoice keeps the seller/buyer details as issued
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_state VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_fssai VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(12, 2) DEFAULT 0;
