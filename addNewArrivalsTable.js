const pool = require('./db');
require('dotenv').config();

async function createNewArrivalsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS new_arrivals (
                id SERIAL PRIMARY KEY,
                product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('New Arrivals table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating New Arrivals table:', error);
        process.exit(1);
    }
}

createNewArrivalsTable();
