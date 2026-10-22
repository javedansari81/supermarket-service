-- =====================================================
-- Supermarket Management System - GST on purchases (input tax credit)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- 'gst_invoice' (supplier charged GST) or 'no_gst' (handwritten receipt, bill of supply);
-- supplier GSTIN and inter-state flag are kept as on the bill
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_type VARCHAR(20) NOT NULL DEFAULT 'no_gst';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_gstin VARCHAR(15);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_interstate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(12, 2) DEFAULT 0;
-- Bill grand total minus the sum of line amounts (at most Rs 1 either way)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS round_off DECIMAL(10, 2) DEFAULT 0;

-- rate = price per unit as on the bill (GST included); unit_cost = cost to stock, without
-- GST that is claimed; total_cost = line amount as on the bill.
-- itc_eligible = line is on a GST bill with its GST % shown, so its GST is claimed.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS rate DECIMAL(10, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS gst_percent DECIMAL(5, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS itc_eligible BOOLEAN NOT NULL DEFAULT FALSE;

-- Earlier purchases are treated as bills without GST
UPDATE purchase_items SET rate = unit_cost WHERE rate IS NULL;
UPDATE purchase_items SET taxable_value = total_cost WHERE taxable_value = 0;
UPDATE purchases SET taxable_amount = total_amount WHERE taxable_amount = 0;
ALTER TABLE purchase_items ALTER COLUMN rate SET NOT NULL;
