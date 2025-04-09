const pool = require('../db');

async function addVerificationStatus() {
    try {
        // Add is_verified column to users table
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)
        `);
        
        console.log('Successfully added verification status columns to users table');
    } catch (error) {
        console.error('Error adding verification status:', error);
        throw error;
    }
}

// Run the migration
addVerificationStatus()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    }); 