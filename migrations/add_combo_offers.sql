-- Create combo_offers and combo_offer_items tables

CREATE TABLE IF NOT EXISTS combo_offers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage','fixed')),
    discount_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_date TIMESTAMP NULL,
    end_date TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combo_offer_items (
    id SERIAL PRIMARY KEY,
    combo_id INTEGER NOT NULL REFERENCES combo_offers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(combo_id, product_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_combo_offers_active ON combo_offers(is_active);
CREATE INDEX IF NOT EXISTS idx_combo_offer_items_combo ON combo_offer_items(combo_id);

-- Use a uniquely named function to avoid collisions
CREATE OR REPLACE FUNCTION update_combo_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_combo_offers_updated_at ON combo_offers;
CREATE TRIGGER trg_combo_offers_updated_at
BEFORE UPDATE ON combo_offers
FOR EACH ROW
EXECUTE FUNCTION update_combo_offers_updated_at();



-- Add support for up to 4 images in combo_offers table
DO $$ 
BEGIN
    -- Add image_url2 column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url2'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url2 TEXT;
    END IF;

    -- Add image_url3 column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url3'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url3 TEXT;
    END IF;

    -- Add image_url4 column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url4'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url4 TEXT;
    END IF;
END $$;