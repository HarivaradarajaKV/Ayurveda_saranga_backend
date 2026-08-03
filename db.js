const { Pool } = require('pg');
require('dotenv').config();

const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Cache PostgreSQL Pool on global object to reuse database connections across Vercel serverless invocations
if (!global._pgPool) {
    global._pgPool = new Pool(
        process.env.DATABASE_URL
            ? {
                  connectionString: process.env.DATABASE_URL,
                  ssl: {
                      rejectUnauthorized: false
                  },
                  family: 4,
                  max: isVercel ? 5 : 15,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: 5000,
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
                  max: 15,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: 5000,
                  keepAlive: true,
              }
    );

    global._pgPool.on('error', (err) => {
        console.error('Database pool error (non-fatal):', err?.message || err);
    });
}

module.exports = global._pgPool;
 