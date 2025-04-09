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
              max: 20,
              idleTimeoutMillis: 300000,
              connectionTimeoutMillis: 10000,
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000
          }
        : {
              user: process.env.DB_USER,
              password: process.env.DB_PASSWORD,
              host: process.env.DB_HOST,
              port: process.env.DB_PORT,
              database: process.env.DB_NAME,
              ssl: {
                  rejectUnauthorized: false
              },
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
    console.error('Unexpected error on idle client', err);
    if (err.code === 'ENETUNREACH') {
        console.error('Network unreachable. Please check your internet connection and firewall settings.');
    } else if (err.code === 'ECONNREFUSED') {
        console.error('Connection refused. Please check if the database server is running and accessible.');
    } else if (err.code === '28P01') {
        console.error('Invalid database credentials. Please check your DB_USER and DB_PASSWORD environment variables.');
    }
    console.error('Attempting to recover from pool error');
});

// Handle pool connection
pool.on('connect', () => {
    console.log('Database connected successfully');
});

// Handle pool removal
pool.on('remove', () => {
    console.log('Database connection pool removed');
    setTimeout(() => {
        pool.connect((err, client, release) => {
            if (err) {
                console.error('Error reconnecting to the database:', err);
            } else {
                console.log('Successfully reconnected to database');
                release();
            }
        });
    }, 1000);
});

module.exports = pool; 