const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { uploadProductImage } = require('./services/supabaseStorage');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const UPLOADS_DIR = path.join(__dirname, 'uploads');

/**
 * Migrate all product images from local uploads folder to Supabase Storage
 */
async function migrateProductImages() {
    console.log('🚀 Starting product image migration to Supabase Storage...\n');

    try {
        // Get all products with local image paths
        const result = await pool.query(`
            SELECT id, name, image_url, image_url2, image_url3 
            FROM products 
            WHERE 
                image_url LIKE '/uploads/%' OR 
                image_url2 LIKE '/uploads/%' OR 
                image_url3 LIKE '/uploads/%'
            ORDER BY id
        `);

        const products = result.rows;
        console.log(`📦 Found ${products.length} products with local image paths\n`);

        if (products.length === 0) {
            console.log('✅ No products to migrate. All images already using Supabase Storage.\n');
            return;
        }

        let totalMigrated = 0;
        let totalFailed = 0;

        // Process each product
        for (const product of products) {
            console.log(`\n--- Processing Product ID: ${product.id} - "${product.name}" ---`);

            const updates = {};
            let productMigrated = false;
            let productFailed = false;

            // Process each image field
            for (let i = 1; i <= 3; i++) {
                const field = i === 1 ? 'image_url' : `image_url${i}`;
                const imageUrl = product[field];

                if (!imageUrl || !imageUrl.startsWith('/uploads/')) {
                    console.log(`  ⏭️  Image ${i}: Skipping (no local path)`);
                    continue;
                }

                // Extract filename from URL
                const filename = imageUrl.replace('/uploads/', '');
                const filePath = path.join(UPLOADS_DIR, filename);

                console.log(`  📸 Image ${i}: ${filename}`);

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    console.log(`  ⚠️  Image ${i}: File not found at ${filePath}`);
                    productFailed = true;
                    continue;
                }

                try {
                    // Upload to Supabase
                    const supabaseResult = await uploadProductImage(filePath, product.id, i);
                    updates[field] = supabaseResult.url;

                    console.log(`  ✅ Image ${i}: Uploaded to Supabase`);
                    console.log(`     New URL: ${supabaseResult.url.substring(0, 80)}...`);
                    productMigrated = true;
                } catch (error) {
                    console.error(`  ❌ Image ${i}: Upload failed - ${error.message}`);
                    productFailed = true;
                }
            }

            // Update database if any images were migrated
            if (Object.keys(updates).length > 0) {
                try {
                    const updateFields = Object.keys(updates)
                        .map((field, idx) => `${field} = $${idx + 1}`)
                        .join(', ');
                    const updateValues = Object.values(updates);
                    updateValues.push(product.id);

                    await pool.query(
                        `UPDATE products SET ${updateFields} WHERE id = $${updateValues.length}`,
                        updateValues
                    );

                    console.log(`  💾 Database updated successfully`);
                    totalMigrated++;
                } catch (error) {
                    console.error(`  ❌ Database update failed: ${error.message}`);
                    totalFailed++;
                }
            } else if (productFailed) {
                totalFailed++;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary');
        console.log('='.repeat(60));
        console.log(`Total products processed: ${products.length}`);
        console.log(`✅ Successfully migrated: ${totalMigrated}`);
        console.log(`❌ Failed: ${totalFailed}`);
        console.log(`⏭️  Skipped: ${products.length - totalMigrated - totalFailed}`);

        // Verify migration
        console.log('\n🔍 Verifying migration...');
        const verifyResult = await pool.query(`
            SELECT COUNT(*) as remaining_local
            FROM products 
            WHERE 
                image_url LIKE '/uploads/%' OR 
                image_url2 LIKE '/uploads/%' OR 
                image_url3 LIKE '/uploads/%'
        `);

        const remainingLocal = parseInt(verifyResult.rows[0].remaining_local);
        if (remainingLocal === 0) {
            console.log('✅ All product images successfully migrated to Supabase Storage!');
        } else {
            console.log(`⚠️  ${remainingLocal} products still have local image paths`);
        }

        console.log('\n✨ Migration complete!\n');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run migration
migrateProductImages()
    .then(() => {
        console.log('👋 Exiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
