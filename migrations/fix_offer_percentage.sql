-- Drop the column if it exists with wrong type
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'products' AND column_name = 'offer_percentage') THEN
        ALTER TABLE products DROP COLUMN offer_percentage;
    END IF;
END $$;

-- Add the column with correct type and default value
ALTER TABLE products ADD COLUMN offer_percentage INTEGER DEFAULT 0;

-- Update any NULL values to 0
UPDATE products SET offer_percentage = 0 WHERE offer_percentage IS NULL; 