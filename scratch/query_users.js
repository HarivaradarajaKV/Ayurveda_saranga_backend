const pool = require('../db');

async function checkUsers() {
    try {
        console.log('Querying last 5 users...');
        const res = await pool.query('SELECT id, name, email, phone, photo_url, created_at, is_sso_user FROM users ORDER BY id DESC LIMIT 5');
        console.log('Users found:');
        console.log(JSON.stringify(res.rows, null, 2));
        pool.end();
    } catch (err) {
        console.error('Error querying database:', err);
        pool.end();
    }
}

checkUsers();
