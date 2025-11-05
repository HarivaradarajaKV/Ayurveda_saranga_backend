# Combo Offers Multiple Images Setup

## Overview
This migration adds support for up to 4 images per combo offer. Images are automatically extracted from the selected products (one image per product, up to 4 products).

## Database Migration Steps

### Step 1: Add Columns to Supabase
Run the following SQL in Supabase SQL Editor:

```sql
-- File: add_combo_offers_multiple_images.sql
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url2'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url2 TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url3'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url3 TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'combo_offers' AND column_name = 'image_url4'
    ) THEN
        ALTER TABLE combo_offers ADD COLUMN image_url4 TEXT;
    END IF;
END $$;
```

### Step 2: Populate Existing Combos (Optional)
If you have existing combos and want to populate their additional image fields from products:

```sql
-- File: populate_combo_multiple_images.sql
-- Run this to backfill existing combos with images from their products
```

## Backend Changes
✅ Updated `backend/routes/combos.js`:
- POST route accepts `image_url2`, `image_url3`, `image_url4`
- PUT route updates all 4 image fields
- All SELECT queries include the new image columns

## Frontend Changes
✅ Updated `app/admin/combos.tsx`:
- Automatically extracts up to 4 images from selected products
- Displays all available images in combo cards
- Shows single image (100x100) if only 1 image exists
- Shows grid (2x2, 48x48 each) if 2-4 images exist

## How It Works

1. **When Creating a Combo:**
   - Admin selects products for the combo
   - System automatically takes images from the first 4 products
   - Images are stored in: `image_url`, `image_url2`, `image_url3`, `image_url4`

2. **When Displaying Combos:**
   - If 1 image: Shows single large image (100x100)
   - If 2-4 images: Shows grid layout (2x2, 48x48 each)

## Verification

After running the migration, verify the columns exist:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'combo_offers' 
AND column_name LIKE 'image_url%'
ORDER BY column_name;
```

You should see:
- image_url
- image_url2
- image_url3
- image_url4

## Testing

1. Create a new combo with 4+ products
2. Check the console logs to see images being extracted
3. Verify all 4 images are saved in the database
4. Check the combo display shows all images correctly




