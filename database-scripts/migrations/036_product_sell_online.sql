-- =====================================================
-- Supermarket Management System - Per-product "Sell online" switch
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- FALSE = sold in store only, hidden from the online shop (e.g. loose dal whose MF packs are sold online)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_online BOOLEAN NOT NULL DEFAULT TRUE;
