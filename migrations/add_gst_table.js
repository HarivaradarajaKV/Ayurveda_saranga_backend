const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Try loading .env from multiple possible locations
// __dirname is: my-app/backend/migrations
// So ../.env = my-app/backend/.env
const envPaths = [
    path.join(__dirname, '../.env'),            // backend/.env (one level up from migrations)
    path.join(__dirname, '../../.env'),         // my-app/.env (two levels up)
    path.join(__dirname, '../../../.env'),      // root/.env (three levels up)
    path.join(__dirname, '../.env.local'),      // backend/.env.local
];

console.log('Current directory:', __dirname);
console.log('Looking for .env files in:');
envPaths.forEach(p => console.log('  -', p));

let envLoaded = false;
for (const envPath of envPaths) {
    try {
        const fullPath = path.resolve(envPath);
        console.log(`Checking: ${fullPath} - ${fs.existsSync(fullPath) ? 'EXISTS' : 'NOT FOUND'}`);
        if (fs.existsSync(fullPath)) {
            const result = require('dotenv').config({ path: fullPath });
            if (result.error) {
                console.error(`Error loading .env from ${fullPath}:`, result.error);
            } else {
                console.log(`✓ Loaded .env from: ${fullPath}`);
                envLoaded = true;
                break;
            }
        }
    } catch (e) {
        console.error(`Error checking ${envPath}:`, e.message);
    }
}

// Fallback to default dotenv config
if (!envLoaded) {
    console.log('Trying default dotenv config...');
    const result = require('dotenv').config();
    if (result.error) {
        console.error('Error with default dotenv config:', result.error);
    } else if (result.parsed) {
        console.log('✓ Loaded .env using default config');
        envLoaded = true;
    } else {
        console.log('No .env file found with default config');
    }
}

// Debug: Check what environment variables are available (without showing sensitive data)
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET');
console.log('DB_USER:', process.env.DB_USER || 'NOT SET');
console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');

// Check if DATABASE_URL is available (for Supabase/cloud databases)
let poolConfig;
if (process.env.DATABASE_URL) {
    // Use connection string if available (Supabase)
    console.log('Using DATABASE_URL for connection...');
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    };
} else {
    // Use individual connection parameters
    console.log('Using individual connection parameters...');
    poolConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : false,
    };
    
    // Validate required fields only if not using DATABASE_URL
    if (!poolConfig.password) {
        console.error('Error: DB_PASSWORD is not set in environment variables');
        console.error('Please check your .env file or set DATABASE_URL for Supabase');
        console.error('Make sure your .env file is in the backend directory or root directory');
        process.exit(1);
    }
}

// Create a new Pool directly (same pattern as other migrations)
const pool = new Pool(poolConfig);

async function addGstTable() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Read and execute SQL file
        const sqlFile = fs.readFileSync(path.join(__dirname, 'add_gst_table.sql'), 'utf8');
        
        await client.query(sqlFile);
        
        await client.query('COMMIT');
        console.log('GST table and related columns created successfully');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error creating GST table:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the migration
addGstTable()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });

