-- Product-level GST setup

-- Table to store GST rates per product
CREATE TABLE IF NOT EXISTS product_gst_rates (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    percentage DECIMAL(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION update_product_gst_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_gst_timestamp
    BEFORE UPDATE ON product_gst_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_product_gst_updated_at();

-- Add GST columns to order_items to store per-item GST snapshot
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='order_items' AND column_name='gst_percentage'
    ) THEN
        ALTER TABLE order_items ADD COLUMN gst_percentage DECIMAL(5,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='order_items' AND column_name='gst_amount'
    ) THEN
        ALTER TABLE order_items ADD COLUMN gst_amount DECIMAL(10,2) DEFAULT 0;
    END IF;
END $$;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_product_gst_rates_product_id ON product_gst_rates(product_id);


