const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Saranga_ayurveda_application_updates/Production_folder_final/02/cosmetics_app/my-app/backend/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'products'
            ORDER BY ordinal_position;
        `);
        console.log('--- PRODUCTS TABLE COLUMNS ---');
        res.rows.forEach(row => {
            console.log(`${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
