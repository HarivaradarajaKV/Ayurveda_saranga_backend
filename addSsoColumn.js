const pool = require('./db');
require('dotenv').config();

async function addSsoColumn() {
    try {
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_sso_user BOOLEAN DEFAULT false;
        `);
        console.log('Successfully added is_sso_user column to users table');
        process.exit(0);
    } catch (error) {
        console.error('Error adding is_sso_user column:', error);
        process.exit(1);
    }
}

addSsoColumn();
