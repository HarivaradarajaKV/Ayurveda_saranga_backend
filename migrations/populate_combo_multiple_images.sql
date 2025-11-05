-- Migration script to populate image_url2, image_url3, image_url4 for existing combos
-- This script takes images from the combo's associated products (one image per product, up to 4)

-- Update existing combos to populate multiple images from their products
UPDATE combo_offers c
SET 
    image_url2 = (
        SELECT p.image_url 
        FROM combo_offer_items coi 
        JOIN products p ON coi.product_id = p.id 
        WHERE coi.combo_id = c.id 
        AND p.image_url IS NOT NULL 
        AND p.image_url != ''
        ORDER BY coi.id 
        LIMIT 1 OFFSET 1
    ),
    image_url3 = (
        SELECT p.image_url 
        FROM combo_offer_items coi 
        JOIN products p ON coi.product_id = p.id 
        WHERE coi.combo_id = c.id 
        AND p.image_url IS NOT NULL 
        AND p.image_url != ''
        ORDER BY coi.id 
        LIMIT 1 OFFSET 2
    ),
    image_url4 = (
        SELECT p.image_url 
        FROM combo_offer_items coi 
        JOIN products p ON coi.product_id = p.id 
        WHERE coi.combo_id = c.id 
        AND p.image_url IS NOT NULL 
        AND p.image_url != ''
        ORDER BY coi.id 
        LIMIT 1 OFFSET 3
    )
WHERE EXISTS (
    SELECT 1 FROM combo_offer_items coi 
    JOIN products p ON coi.product_id = p.id 
    WHERE coi.combo_id = c.id 
    AND p.image_url IS NOT NULL 
    AND p.image_url != ''
);

-- Verify the update
SELECT 
    id,
    title,
    CASE WHEN image_url IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image1,
    CASE WHEN image_url2 IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image2,
    CASE WHEN image_url3 IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image3,
    CASE WHEN image_url4 IS NOT NULL THEN 'Yes' ELSE 'No' END as has_image4,
    (SELECT COUNT(*) FROM combo_offer_items WHERE combo_id = combo_offers.id) as product_count
FROM combo_offers
ORDER BY id;




