const pool = require('./db');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function resetAdminUser() {
    try {
        // Delete existing admin
        await pool.query(
            'DELETE FROM users WHERE email = $1',
            [process.env.ADMIN_EMAIL]
        );
        console.log('Existing admin user deleted');

        // Create new admin user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);

        const newAdmin = await pool.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING email, role',
            [process.env.ADMIN_EMAIL, hashedPassword, 'Admin User', 'admin']
        );

        console.log('New admin user created:', newAdmin.rows[0]);
        process.exit(0);
    } catch (error) {
        console.error('Error resetting admin user:', error);
        process.exit(1);
    }
}

resetAdminUser(); 