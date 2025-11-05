const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined,
});

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, 'add_combo_offers.sql');
        console.log('[Combo Migration] Reading SQL from:', migrationPath);
        const sql = await fs.readFile(migrationPath, 'utf8');
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('COMMIT');
        console.log('[Combo Migration] Completed successfully');
    } catch (error) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('[Combo Migration] Failed:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

runMigration();






