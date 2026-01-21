require('dotenv').config();
const pool = require('../db');

async function checkShiprocketColumns() {
    console.log('=== Checking Shiprocket Database Schema ===\n');

    try {
        // Check if Shiprocket columns exist
        const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name IN (
          'shiprocket_order_id',
          'shiprocket_shipment_id',
          'awb_number',
          'courier_name',
          'courier_id',
          'shipment_status',
          'estimated_delivery_date',
          'tracking_url',
          'label_url',
          'manifest_url',
          'pickup_scheduled_date'
        )
      ORDER BY column_name;
    `);

        console.log(`Found ${result.rows.length} Shiprocket columns:\n`);

        const expectedColumns = [
            'shiprocket_order_id',
            'shiprocket_shipment_id',
            'awb_number',
            'courier_name',
            'courier_id',
            'shipment_status',
            'estimated_delivery_date',
            'tracking_url',
            'label_url',
            'manifest_url',
            'pickup_scheduled_date'
        ];

        const foundColumns = result.rows.map(row => row.column_name);
        const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));

        if (result.rows.length > 0) {
            result.rows.forEach(row => {
                console.log(`✅ ${row.column_name} (${row.data_type})`);
            });
        }

        if (missingColumns.length > 0) {
            console.log(`\n❌ Missing columns (${missingColumns.length}):`);
            missingColumns.forEach(col => {
                console.log(`   - ${col}`);
            });
            console.log('\n⚠️ Migration needs to be run!\n');
        } else {
            console.log('\n✅ All Shiprocket columns exist in database!');
        }

        process.exit(missingColumns.length > 0 ? 1 : 0);

    } catch (error) {
        console.error('❌ Error checking schema:', error.message);
        process.exit(1);
    }
}

checkShiprocketColumns();
