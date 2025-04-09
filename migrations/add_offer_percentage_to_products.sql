-- Add offer_percentage column to products table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'offer_percentage') THEN
        ALTER TABLE products ADD COLUMN offer_percentage INTEGER DEFAULT 0;
    END IF;
END $$; 