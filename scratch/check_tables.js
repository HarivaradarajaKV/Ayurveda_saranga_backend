const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Saranga_ayurveda_application_updates/Production_folder_final/02/cosmetics_app/my-app/backend/.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('--- TABLES IN DB ---');
        res.rows.forEach(row => {
            console.log(row.table_name);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
