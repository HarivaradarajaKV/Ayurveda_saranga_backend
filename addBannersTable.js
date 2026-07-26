const pool = require('./db');
require('dotenv').config();

async function createBannersTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS banners (
                id          SERIAL PRIMARY KEY,
                title       TEXT,
                image_url   TEXT NOT NULL,
                link_type   TEXT NOT NULL DEFAULT 'product',
                link_value  TEXT,
                platform    TEXT NOT NULL DEFAULT 'web',
                section     TEXT NOT NULL DEFAULT 'top',
                sort_order  INTEGER DEFAULT 0,
                is_active   BOOLEAN DEFAULT TRUE,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Banners table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating banners table:', error);
        process.exit(1);
    }
}

createBannersTable();
