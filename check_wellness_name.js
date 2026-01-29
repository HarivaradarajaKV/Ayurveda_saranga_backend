const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkName() {
    try {
        const result = await pool.query("SELECT name FROM categories WHERE name ILIKE '%wellness%' OR name ILIKE '%pharmacy%'");
        console.log('---START NAMES---');
        result.rows.forEach(r => console.log(r.name));
        console.log('---END NAMES---');
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

checkName();
