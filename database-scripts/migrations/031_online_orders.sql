-- =====================================================
-- Supermarket Management System - Online orders (home delivery)
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Delivery addresses belong to the login, so they work at every store
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    contact_name VARCHAR(200) NOT NULL,
    contact_mobile VARCHAR(10) NOT NULL,
    address_line VARCHAR(300) NOT NULL,
    area VARCHAR(200) NOT NULL,
    landmark VARCHAR(200),
    city VARCHAR(100) NOT NULL,
    pincode CHAR(6) NOT NULL,
    label VARCHAR(20),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_account ON customer_addresses(account_id);

-- Orders reserve stock while open (placed to out_for_delivery); stock is taken off when
-- the order is delivered and becomes a sale. The delivery address is copied onto the order.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_no VARCHAR(30) NOT NULL,
    account_id INTEGER NOT NULL REFERENCES customer_accounts(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'placed'
        CHECK (status IN ('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled')),
    -- cod = cash on delivery; online = prepaid by UPI or card through the payment gateway
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cod', 'online')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    delivery_name VARCHAR(200) NOT NULL,
    delivery_mobile VARCHAR(10) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_pincode CHAR(6) NOT NULL,
    mrp_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    items_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes VARCHAR(500),
    cancel_reason VARCHAR(300),
    cancelled_by VARCHAR(20) CHECK (cancelled_by IN ('customer', 'store')),
    sale_id INTEGER REFERENCES sales(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_orders_tenant_order_no UNIQUE (tenant_id, order_no)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);

-- Prices as shown to the customer when ordering; loose quantities are kg / L, billed at the
-- weighed quantity when packed
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name VARCHAR(200) NOT NULL,
    is_loose BOOLEAN NOT NULL DEFAULT FALSE,
    unit_type VARCHAR(50),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    mrp NUMERIC(10, 2),
    unit_price NUMERIC(10, 2) NOT NULL,
    offer_price NUMERIC(10, 2) NOT NULL,
    discount_source VARCHAR(20),
    offer_name VARCHAR(200),
    line_total NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Delivery charge unless the items total reaches the free delivery amount
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description)
SELECT t.id, s.setting_key, s.setting_value, 'number', s.description
FROM tenants t
CROSS JOIN (VALUES
    ('delivery_charge', '30', 'Delivery charge for online orders (Rs)'),
    ('free_delivery_min', '300', 'Online order amount for free delivery (Rs)')
) AS s(setting_key, setting_value, description)
ON CONFLICT (tenant_id, setting_key) DO NOTHING;
