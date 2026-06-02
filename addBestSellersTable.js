const pool = require('./db');
require('dotenv').config();

async function createBestSellersTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS best_sellers (
                id SERIAL PRIMARY KEY,
                product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Best Sellers table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating Best Sellers table:', error);
        process.exit(1);
    }
}

createBestSellersTable();
