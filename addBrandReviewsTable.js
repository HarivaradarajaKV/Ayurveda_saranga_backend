const pool = require('./db');

async function createBrandReviewsTable() {
    try {
        // First, check and add avatar_url column to users table if it doesn't exist
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
                    ALTER TABLE users ADD COLUMN avatar_url TEXT;
                END IF;
            END $$;
        `);
        console.log('Checked and added avatar_url column if needed');

        // Create brand_reviews table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS brand_reviews (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            );
        `);
        console.log('Brand reviews table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating brand reviews table:', error);
        process.exit(1);
    }
}

createBrandReviewsTable(); 