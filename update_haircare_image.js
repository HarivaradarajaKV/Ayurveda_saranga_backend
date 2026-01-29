const { uploadProductImage } = require('./services/supabaseStorage');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function updateCategory() {
    console.log('🚀 Starting Haircare Category Image Update...');

    const categoryId = 14;
    const imagePath = 'C:/Users/hariv/.gemini/antigravity/brain/da63467d-541f-4b2c-bf45-6052fadb3cac/uploaded_image_1769668695973.jpg';

    if (!fs.existsSync(imagePath)) {
        console.error('❌ Image file not found:', imagePath);
        process.exit(1);
    }

    try {
        console.log('📤 Uploading image to Supabase...');
        // Reuse uploadProductImage - it works for any image, puts it in 'product-images' bucket which is fine
        // We'll give it a name like 'category_haircare_TIMESTAMP'
        const result = await uploadProductImage(imagePath, 'category_haircare', 0); // 0 as index for unique name generation if needed

        const publicUrl = result.url;
        console.log('✅ Image uploaded successfully:', publicUrl);

        console.log('💾 Updating database...');
        const updateResult = await pool.query(
            "UPDATE categories SET image_url = $1 WHERE id = $2 RETURNING *",
            [publicUrl, categoryId]
        );

        console.log('✅ Database updated:', updateResult.rows[0]);

    } catch (error) {
        console.error('❌ Failed to update category image:', error);
    } finally {
        await pool.end();
    }
}

updateCategory();
