-- =====================================================
-- Supermarket Management System - Store locations and product placement
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Physical places in the store, optionally nested (zone > aisle > rack > shelf)
CREATE TABLE IF NOT EXISTS store_locations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_code VARCHAR(50) NOT NULL,
    location_name VARCHAR(100),
    location_type VARCHAR(20) NOT NULL DEFAULT 'shelf'
        CHECK (location_type IN ('zone', 'aisle', 'rack', 'shelf', 'bin', 'backroom')),
    parent_id INTEGER REFERENCES store_locations(id),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_store_locations_tenant_code UNIQUE (tenant_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_store_locations_tenant ON store_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_locations_parent ON store_locations(parent_id);

-- Where a product is kept; a product can have several locations, each with a role
CREATE TABLE IF NOT EXISTS product_locations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES store_locations(id),
    role VARCHAR(20) NOT NULL DEFAULT 'display' CHECK (role IN ('display', 'storage', 'promo')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_locations_product_location UNIQUE (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_locations_tenant ON product_locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_location ON product_locations(location_id);
