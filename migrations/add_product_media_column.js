const pool = require('../db');

async function migrate() {
    console.log('🚀 Starting Database Migration: add_media_column to products...');

    try {
        // 1. Add column if it doesn't exist
        console.log('Adding column "media" of type JSONB...');
        await pool.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
        `);
        console.log('✅ Column added successfully (or already exists).');

        // 2. Migrate existing product images
        console.log('Migrating existing image columns to the "media" JSONB array...');
        const migrateResult = await pool.query(`
            UPDATE products 
            SET media = (
                SELECT jsonb_agg(jsonb_build_object('url', url, 'type', 'image'))
                FROM unnest(ARRAY[image_url, image_url2, image_url3]) AS url
                WHERE url IS NOT NULL AND url != ''
            )
            WHERE media IS NULL OR jsonb_array_length(media) = 0;
        `);
        console.log(`✅ Migrated existing images in ${migrateResult.rowCount} rows.`);

        // 3. Fallback for any NULL media fields
        console.log('Ensuring all products have at least an empty array for media...');
        await pool.query(`
            UPDATE products 
            SET media = '[]'::jsonb 
            WHERE media IS NULL;
        `);
        console.log('✅ Fallback check completed.');

        // 4. Verify results
        const countRes = await pool.query('SELECT COUNT(*) as total FROM products');
        const mediaCountRes = await pool.query("SELECT COUNT(*) as total FROM products WHERE media IS NOT NULL AND media != '[]'::jsonb");
        
        console.log('\n📊 Migration Summary:');
        console.log(`Total Products: ${countRes.rows[0].total}`);
        console.log(`Products with active media objects: ${mediaCountRes.rows[0].total}`);
        console.log('\n🎉 DATABASE MIGRATION COMPLETED SUCCESSFULLY!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
