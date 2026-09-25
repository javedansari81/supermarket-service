-- =====================================================
-- Supermarket Management System - Product stock batches
-- Schema: mart
-- =====================================================

SET search_path TO mart, public;

-- Stock of a packed product received at one MRP / price / expiry.
-- Loose items (sold by weight) keep a single product-level price and have no batches.
CREATE TABLE IF NOT EXISTS product_batches (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_no VARCHAR(50),
    barcode VARCHAR(100),
    mrp NUMERIC(10, 2),
    selling_price NUMERIC(10, 2),
    purchase_price NUMERIC(10, 2),
    expiry_date DATE,
    quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0,
    quantity_left NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity_left >= 0),
    purchase_id INTEGER REFERENCES purchases(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_batches_tenant_barcode UNIQUE (tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_tenant ON product_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_in_stock ON product_batches(product_id) WHERE quantity_left > 0;

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS batch_no VARCHAR(50);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS mrp NUMERIC(10, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS expiry_date DATE;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);
ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_batch ON purchase_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON sale_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);

-- Opening batch for current stock of packed products, at the product's current prices
INSERT INTO product_batches (tenant_id, product_id, batch_no, mrp, selling_price, purchase_price,
                             expiry_date, quantity_received, quantity_left)
SELECT p.tenant_id, p.id, 'OPENING', p.mrp, p.selling_price, p.purchase_price,
       p.expiry_date, p.stock_quantity, p.stock_quantity
FROM products p
WHERE NOT p.is_loose
  AND p.stock_quantity > 0
  AND NOT EXISTS (SELECT 1 FROM product_batches b WHERE b.product_id = p.id);
