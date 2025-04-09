const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Use the same database configuration as your main app
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigration() {
    try {
        console.log('Starting migration...');
        
        // Read the migration file
        const migrationPath = path.join(__dirname, 'add_updated_at_to_products.sql');
        console.log('Reading migration file from:', migrationPath);
        
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');
        console.log('Migration SQL:', migrationSQL);

        // Run the migration
        await pool.query(migrationSQL);
        
        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
        if (error.code === '28P01') {
            console.error('Database authentication failed. Please check your environment variables.');
        }
    } finally {
        await pool.end();
    }
}

runMigration(); 