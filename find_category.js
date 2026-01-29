const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function findCategory() {
    try {
        const result = await pool.query("SELECT * FROM categories WHERE name ILIKE '%hair%'");
        console.table(result.rows);
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

findCategory();
