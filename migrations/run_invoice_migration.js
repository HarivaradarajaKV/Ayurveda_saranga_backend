const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: { rejectUnauthorized: false },
          }
        : {
              user: process.env.DB_USER,
              host: process.env.DB_HOST,
              database: process.env.DB_NAME,
              password: process.env.DB_PASSWORD,
              port: process.env.DB_PORT || 5432,
              ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
          }
);

async function runMigration() {
    try {
        console.log('Starting invoice module migration...');
        
        const migrationPath = path.join(__dirname, 'create_invoice_tables.sql');
        console.log('Reading migration file from:', migrationPath);
        
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');
        
        console.log('Executing SQL migration script on database...');
        await pool.query(migrationSQL);
        
        console.log('Invoice module migration completed successfully.');
    } catch (error) {
        console.error('Invoice module migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
