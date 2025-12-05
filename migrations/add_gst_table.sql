-- GST Table Migration
-- This creates a GST table for managing GST rates
-- GST is applied to orders but does not affect product prices

-- Create GST table
CREATE TABLE IF NOT EXISTS gst_rates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    percentage DECIMAL(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add GST fields to orders table
DO $$ 
BEGIN 
    -- Add gst_percentage column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='orders' AND column_name='gst_percentage'
    ) THEN 
        ALTER TABLE orders 
        ADD COLUMN gst_percentage DECIMAL(5,2) DEFAULT 0;
    END IF;

    -- Add gst_amount column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='orders' AND column_name='gst_amount'
    ) THEN 
        ALTER TABLE orders 
        ADD COLUMN gst_amount DECIMAL(10,2) DEFAULT 0;
    END IF;
END $$;

-- Add trigger for GST rates updated_at
CREATE OR REPLACE FUNCTION update_gst_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_gst_timestamp
    BEFORE UPDATE ON gst_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_gst_updated_at_column();

-- Insert default GST rate (18% - common GST rate in India)
INSERT INTO gst_rates (name, description, percentage, is_active)
VALUES ('Standard GST', 'Standard GST rate for products', 18.00, true)
ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gst_rates_active ON gst_rates(is_active);


