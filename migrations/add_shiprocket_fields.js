const pool = require('../db');

async function addShiprocketFields() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Adding Shiprocket fields to orders table...');

        // Add Shiprocket related columns to orders table
        await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shiprocket_order_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS shiprocket_shipment_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255),
      ADD COLUMN IF NOT EXISTS courier_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS courier_id INTEGER,
      ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(100),
      ADD COLUMN IF NOT EXISTS estimated_delivery_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS tracking_url TEXT,
      ADD COLUMN IF NOT EXISTS label_url TEXT,
      ADD COLUMN IF NOT EXISTS manifest_url TEXT,
      ADD COLUMN IF NOT EXISTS pickup_scheduled_date TIMESTAMP
    `);

        console.log('Shiprocket fields added successfully');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding Shiprocket fields:', error);
        throw error;
    } finally {
        client.release();
    }
}

addShiprocketFields()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
