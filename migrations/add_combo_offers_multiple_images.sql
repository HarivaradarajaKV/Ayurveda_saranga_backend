-- Add support for up to 4 images in combo_offers table
-- This migration adds image_url2, image_url3, and image_url4 columns
-- Images will be picked from the added products (one image per product, up to 4)

-- Add additional image columns if they don't exist
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

-- Optional: Add a comment to document the image columns
COMMENT ON COLUMN combo_offers.image_url IS 'Primary combo image (from first product)';
COMMENT ON COLUMN combo_offers.image_url2 IS 'Second combo image (from second product, if available)';
COMMENT ON COLUMN combo_offers.image_url3 IS 'Third combo image (from third product, if available)';
COMMENT ON COLUMN combo_offers.image_url4 IS 'Fourth combo image (from fourth product, if available)';





