const pool = require('../db');

async function migrate() {
    console.log('🚀 Starting Database Migration: add image_url4 column to products...');

    try {
        // Add image_url4 column of type VARCHAR(255)
        console.log('Adding column "image_url4" to products...');
        await pool.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS image_url4 VARCHAR(255) DEFAULT NULL;
        `);
        console.log('✅ Column image_url4 added successfully (or already exists).');

        // Verification
        const res = await pool.query('SELECT * FROM products LIMIT 1');
        const fields = res.fields.map(f => f.name);
        console.log('\n📊 Table structure verification:');
        console.log('Available image columns in products table:', fields.filter(name => name.startsWith('image_url')));

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
