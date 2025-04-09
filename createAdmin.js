const bcrypt = require('bcrypt');
const pool = require('./db');
require('dotenv').config();

async function createAdminUser() {
    try {
        // Check if admin already exists
        const adminExists = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [process.env.ADMIN_EMAIL]
        );

        if (adminExists.rows.length > 0) {
            console.log('Admin user already exists');
            process.exit(0);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);

        // Create admin user
        const newAdmin = await pool.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [process.env.ADMIN_EMAIL, hashedPassword, 'Admin User', 'admin']
        );

        console.log('Admin user created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    }
}

createAdminUser(); 