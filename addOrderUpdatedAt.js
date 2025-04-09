const pool = require('./db');
require('dotenv').config();

async function addOrderUpdatedAt() {
    try {
        await pool.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        console.log('Successfully added updated_at column to orders table');
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

addOrderUpdatedAt(); 