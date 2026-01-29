const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function verifyMigration() {
    console.log('🔍 Verifying product image migration...');

    try {
        const result = await pool.query(`
            SELECT COUNT(*) as remaining_local,
                   COUNT(CASE WHEN image_url LIKE '%supabase%' THEN 1 END) as migrated_count
            FROM products 
            WHERE 
                image_url LIKE '/uploads/%' OR 
                image_url2 LIKE '/uploads/%' OR 
                image_url3 LIKE '/uploads/%'
        `);

        const remaining = parseInt(result.rows[0].remaining_local);

        console.log('\n📊 Verification Results:');
        console.log(`------------------------`);

        if (remaining === 0) {
            console.log('✅ SUCCESS: All products are using Supabase Storage URLs.');
            console.log('   No local /uploads/ paths found in database.');
        } else {
            console.log(`⚠️  WARNING: ${remaining} products still have local image paths.`);

            // List the specific IDs
            const listPath = await pool.query(`
                SELECT id, name FROM products 
                WHERE image_url LIKE '/uploads/%' 
                   OR image_url2 LIKE '/uploads/%' 
                   OR image_url3 LIKE '/uploads/%'
                LIMIT 5
            `);
            console.log('   Sample IDs needing migration:', listPath.rows.map(r => r.id).join(', '));
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await pool.end();
    }
}

verifyMigration();
