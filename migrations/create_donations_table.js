const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: { rejectUnauthorized: false },
              family: 4,
          }
        : {
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              host: process.env.DB_HOST,
              port: process.env.DB_PORT,
              database: process.env.DB_NAME,
              ssl: false,
              family: 4,
          }
);

async function run() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS donations (
                id                  SERIAL PRIMARY KEY,
                razorpay_order_id   VARCHAR(255) NOT NULL UNIQUE,
                razorpay_payment_id VARCHAR(255),
                razorpay_signature  VARCHAR(512),
                amount_paise        INTEGER NOT NULL,
                amount_rupees       NUMERIC(10,2) NOT NULL,
                currency            VARCHAR(10) DEFAULT 'INR',
                donor_name          VARCHAR(255) DEFAULT 'Anonymous',
                is_anonymous        BOOLEAN DEFAULT FALSE,
                payment_status      VARCHAR(50) DEFAULT 'pending',
                notes               TEXT,
                created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        console.log('✅  donations table created / already exists — OK');
        await pool.end();
    } catch (e) {
        console.error('❌  Migration failed:', e.message);
        await pool.end();
        process.exit(1);
    }
}

run();
