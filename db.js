const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                  rejectUnauthorized: false
              },
              // Force IPv4
              family: 4,
              max: process.env.VERCEL ? 4 : 20, // Keep pool small in Vercel Serverless to prevent PgBouncer pool exhaustion
              idleTimeoutMillis: process.env.VERCEL ? 15000 : 300000, // Release idle connections quickly in Vercel
              connectionTimeoutMillis: 30000, // Increased timeout
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000,
              retryDelayMillis: 5000, // Add retry delay
              retryAttempts: 3 // Add retry attempts
          }
        : {
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              host: process.env.DB_HOST,
              port: process.env.DB_PORT,
              database: process.env.DB_NAME,
              ssl: false, // Disable SSL for local development
              // Force IPv4
              family: 4,
              max: 20,
              idleTimeoutMillis: 300000,
              connectionTimeoutMillis: 10000,
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000
          }
);

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err?.message || err);
});

module.exports = pool; 