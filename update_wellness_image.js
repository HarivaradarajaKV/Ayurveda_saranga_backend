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

async function updateWellness() {
    console.log('🚀 Starting Wellness Pharmacy Image Update...');

    const imagePath = 'C:/Users/hariv/.gemini/antigravity/brain/da63467d-541f-4b2c-bf45-6052fadb3cac/uploaded_image_1769674257956.jpg';

    if (!fs.existsSync(imagePath)) {
        console.error('❌ Image file not found:', imagePath);
        process.exit(1);
    }

    try {
        console.log('📤 Uploading image to Supabase...');
        const result = await uploadProductImage(imagePath, 'category_wellness', 0);
        const publicUrl = result.url;
        console.log('✅ Image uploaded successfully:', publicUrl);

        // Update DB if category exists (finding by partial name)
        console.log('finding category...');
        const catRes = await pool.query("SELECT id, name FROM categories WHERE name ILIKE '%wellness%' OR name ILIKE '%pharmacy%' LIMIT 1");

        if (catRes.rows.length > 0) {
            const cat = catRes.rows[0];
            console.log(`Found category: "${cat.name}" (ID: ${cat.id}). Updating DB...`);
            await pool.query("UPDATE categories SET image_url = $1 WHERE id = $2", [publicUrl, cat.id]);
            console.log('✅ Database updated.');
        } else {
            console.log('⚠️ Could not find "Wellness" or "Pharmacy" category in DB. Only updating frontend constant.');
        }

        // Write URL to file for easy reading
        fs.writeFileSync('wellness_url.txt', publicUrl);

    } catch (error) {
        console.error('❌ Failed to update wellness image:', error);
    } finally {
        await pool.end();
    }
}

updateWellness();
