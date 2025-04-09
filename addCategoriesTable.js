const pool = require('./db');
require('dotenv').config();

async function createCategoriesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                image_url TEXT,
                parent_id INTEGER REFERENCES categories(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Add category_id to products table if it doesn't exist
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name='products' AND column_name='category_id'
                ) THEN 
                    ALTER TABLE products 
                    ADD COLUMN category_id INTEGER REFERENCES categories(id);
                END IF;
            END $$;
        `);
        console.log('Categories table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating categories table:', error);
        process.exit(1);
    }
}

createCategoriesTable(); 