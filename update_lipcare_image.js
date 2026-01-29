const { uploadProductImage } = require('./services/supabaseStorage');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function updateLipCare() {
    console.log('🚀 Starting Lip Care Image Update...');

    const imagePath = 'C:/Users/hariv/.gemini/antigravity/brain/da63467d-541f-4b2c-bf45-6052fadb3cac/uploaded_image_1769673696076.jpg';

    if (!fs.existsSync(imagePath)) {
        console.error('❌ Image file not found:', imagePath);
        process.exit(1);
    }

    try {
        console.log('📤 Uploading image to Supabase...');
        const result = await uploadProductImage(imagePath, 'category_lipcare', 0);
        const publicUrl = result.url;
        console.log('✅ Image uploaded successfully:', publicUrl);

        // Optional: Update DB if category exists (finding by name)
        console.log('finding category...');
        const catRes = await pool.query("SELECT id FROM categories WHERE name ILIKE '%lip%care%' LIMIT 1");

        if (catRes.rows.length > 0) {
            const catId = catRes.rows[0].id;
            console.log(`Found Lip Care category ID: ${catId}. Updating DB...`);
            await pool.query("UPDATE categories SET image_url = $1 WHERE id = $2", [publicUrl, catId]);
            console.log('✅ Database updated.');
        } else {
            console.log('⚠️ Could not find specific Lip Care category in DB, but proceeding to update frontend constant.');
        }

    } catch (error) {
        console.error('❌ Failed to update lip care image:', error);
    } finally {
        await pool.end();
    }
}

updateLipCare();
