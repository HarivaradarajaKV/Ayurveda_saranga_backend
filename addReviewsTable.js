const pool = require('./db');
require('dotenv').config();

async function createReviewsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                product_id INTEGER REFERENCES products(id),
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id)
            );
        `);
        console.log('Reviews table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating reviews table:', error);
        process.exit(1);
    }
}

createReviewsTable(); 