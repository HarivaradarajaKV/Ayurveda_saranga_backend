const pool = require('../db');

async function addTemporaryOrderField() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add is_temporary column with default value false
        await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT false
        `);

        await client.query('COMMIT');
        console.log('Successfully added is_temporary field to orders table');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error adding is_temporary field:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Run the migration
addTemporaryOrderField()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    }); 