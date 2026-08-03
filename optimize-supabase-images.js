const pool = require('./db');
const { uploadImage, deleteImage, BUCKET_NAME } = require('./services/supabaseStorage');
const fetch = require('node-fetch');
const Jimp = require('jimp');

/**
 * Utility script to compress heavy PNG/JPG category and product images stored in Supabase Storage down to optimized WebP/JPEG format.
 */
async function compressSupabaseImages() {
    console.log('🚀 Starting Supabase Storage Image Compression & WebP Migration...\n');

    try {
        // 1. Process Categories
        const catRes = await pool.query('SELECT id, name, image_url FROM categories WHERE image_url IS NOT NULL');
        console.log(`📦 Found ${catRes.rows.length} categories to check...`);

        for (const cat of catRes.rows) {
            if (!cat.image_url || !cat.image_url.includes(BUCKET_NAME)) continue;
            
            // Check if image is already webp
            if (cat.image_url.toLowerCase().endsWith('.webp')) {
                console.log(`  ⏭️ Category ${cat.id} (${cat.name}): Already WebP format.`);
                continue;
            }

            console.log(`  🔄 Optimizing category ${cat.id} (${cat.name}): ${cat.image_url.substring(0, 70)}...`);
            
            try {
                const res = await fetch(cat.image_url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const arrayBuffer = await res.arrayBuffer();
                const inputBuffer = Buffer.from(arrayBuffer);
                
                if (inputBuffer.length < 200 * 1024) {
                    console.log(`  ⏭️ Already small (${(inputBuffer.length / 1024).toFixed(1)} KB), skipping.`);
                    continue;
                }

                // Process image using Jimp
                const image = await Jimp.read(inputBuffer);
                image.scaleToFit({ w: 800, h: 800 });
                image.quality(80);
                
                const outputBuffer = await image.getBuffer(Jimp.MIME_JPEG);
                
                const safeName = String(cat.name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const newFileName = `category-${safeName}-${Date.now()}.jpg`;

                // Upload optimized JPEG to Supabase
                const uploadResult = await uploadImage(outputBuffer, newFileName, 'image/jpeg');
                
                // Update database
                await pool.query('UPDATE categories SET image_url = $1 WHERE id = $2', [uploadResult.url, cat.id]);
                
                // Delete heavy old image from Supabase
                await deleteImage(cat.image_url);
                
                const savedPercent = ((1 - outputBuffer.length / inputBuffer.length) * 100).toFixed(1);
                console.log(`  ✅ Reduced from ${(inputBuffer.length / 1024).toFixed(1)} KB to ${(outputBuffer.length / 1024).toFixed(1)} KB (${savedPercent}% saved)!`);
            } catch (err) {
                console.error(`  ❌ Failed to compress category ${cat.id}:`, err.message);
            }
        }

        console.log('\n🎉 Category image compression finished!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        pool.end();
    }
}

compressSupabaseImages();
