const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixGst() {
    console.log('🔧 Fixing GST Data...');

    try {
        // Activate the first global GST rate found
        console.log('Activating Global GST Rate...');
        const result = await pool.query(`
            UPDATE gst_rates 
            SET is_active = true 
            WHERE id = (SELECT id FROM gst_rates ORDER BY created_at DESC LIMIT 1)
            RETURNING *
        `);

        if (result.rows.length > 0) {
            console.log('✅ Activated GST Rate:', result.rows[0]);
        } else {
            console.log('⚠️  No global GST rate found to activate. Creating one...');
            const newRate = await pool.query(`
                INSERT INTO gst_rates (name, percentage, is_active, description)
                VALUES ('Standard GST', 18, true, 'Default GST Rate')
                RETURNING *
            `);
            console.log('✅ Created and Activated GST Rate:', newRate.rows[0]);
        }

    } catch (error) {
        console.error('❌ Fix failed:', error);
    } finally {
        await pool.end();
    }
}

fixGst();
