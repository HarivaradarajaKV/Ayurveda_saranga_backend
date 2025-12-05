const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load env (support backend/.env and root .env)
const envPaths = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../.env.local'),
    path.join(__dirname, '../.env.local'),
];

for (const p of envPaths) {
    if (fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        console.log(`[product_gst] Loaded env from ${p}`);
        break;
    }
}

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: { rejectUnauthorized: false },
          }
        : {
              user: process.env.DB_USER,
              host: process.env.DB_HOST,
              database: process.env.DB_NAME,
              password: process.env.DB_PASSWORD,
              port: process.env.DB_PORT || 5432,
              ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
          }
);

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const sql = fs.readFileSync(path.join(__dirname, 'add_product_gst.sql'), 'utf8');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('[product_gst] Migration completed');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[product_gst] Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run();


