const pool = require('./db');
require('dotenv').config();

async function checkAdminUser() {
    try {
        const result = await pool.query(
            'SELECT email, role FROM users WHERE email = $1',
            [process.env.ADMIN_EMAIL]
        );
        
        if (result.rows.length > 0) {
            console.log('Admin user found:', result.rows[0]);
        } else {
            console.log('Admin user not found');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error checking admin user:', error);
        process.exit(1);
    }
}

checkAdminUser(); 