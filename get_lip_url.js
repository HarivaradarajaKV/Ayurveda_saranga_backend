const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function getLipUrl() {
    try {
        const result = await pool.query("SELECT image_url FROM categories WHERE id = 36");
        const url = result.rows[0].image_url;
        fs.writeFileSync('lip_url.txt', url);
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

getLipUrl();
