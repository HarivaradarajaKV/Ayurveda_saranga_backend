const pool = require('../db');

async function run() {
    try {
        console.log('Altering donations table to add donor_phone column...');
        await pool.query(`
            ALTER TABLE donations 
            ADD COLUMN IF NOT EXISTS donor_phone VARCHAR(50);
        `);
        console.log('✅  donor_phone column added / already exists — OK');
        await pool.end();
    } catch (e) {
        console.error('❌  Migration failed:', e.message);
        await pool.end();
        process.exit(1);
    }
}

run();
