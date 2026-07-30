const { Pool } = require('pg');
require('dotenv').config();

const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                  rejectUnauthorized: false
              },
              family: 4,
              max: isVercel ? 2 : 10, // Small pool for Vercel serverless functions to prevent connection exhaustion
              idleTimeoutMillis: 10000,
              connectionTimeoutMillis: 10000,
              keepAlive: true,
          }
        : {
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              host: process.env.DB_HOST,
              port: process.env.DB_PORT,
              database: process.env.DB_NAME,
              ssl: false,
              family: 4,
              max: 10,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 10000,
              keepAlive: true,
          }
);

// Handle pool errors gracefully without crashing process
pool.on('error', (err) => {
    console.error('Database pool error (non-fatal):', err?.message || err);
});

module.exports = pool;
 