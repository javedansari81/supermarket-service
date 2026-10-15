-- =====================================================
-- Supermarket Management System - Supervisor role
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

INSERT INTO roles (role_name, description) VALUES
    ('supervisor', 'Supervisor who helps cashiers: returns, voids, locations, product edits and barcodes')
ON CONFLICT (role_name) DO NOTHING;
