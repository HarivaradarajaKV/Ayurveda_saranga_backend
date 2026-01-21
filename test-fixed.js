require('dotenv').config();
const fs = require('fs');
const pool = require('./db');
const shiprocketService = require('./services/shiprocket');

async function test() {
    try {
        const orderResult = await pool.query(`
      SELECT o.*, u.email
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.status = 'confirmed'
      LIMIT 1
    `);

        if (orderResult.rows.length === 0) {
            console.log('No orders found');
            process.exit(1);
        }

        const order = orderResult.rows[0];
        console.log('Testing with order ID:', order.id);
        console.log('Customer:', order.shipping_full_name);

        // Split name into first and last
        const nameParts = order.shipping_full_name.split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'Name';

        const testData = {
            order_id: order.id.toString(),
            order_date: new Date().toISOString().split('T')[0],
            pickup_location: 'warehouse',
            billing_customer_name: firstName,
            billing_last_name: lastName,
            billing_address: order.shipping_address_line1,
            billing_city: order.shipping_city,
            billing_postcode: order.shipping_postal_code,
            billing_state: order.shipping_state,
            billing_country: 'India',
            billing_email: order.email || 'test@example.com',
            billing_phone: order.shipping_phone_number,
            shipping_is_billing: true,
            order_items: [{
                name: 'Test Product',
                sku: 'TEST123',
                units: 1,
                selling_price: 100,
                discount: 0,
                tax: 0,
                hsn: 441122
            }],
            payment_method: 'Prepaid',
            sub_total: 100,
            length: 10,
            breadth: 10,
            height: 10,
            weight: 0.5
        };

        console.log('\nSending to Shiprocket...\n');
        const response = await shiprocketService.createOrder(testData);

        console.log('✅ SUCCESS!');
        console.log('Order ID:', response.order_id);
        console.log('Shipment ID:', response.shipment_id);
        console.log('\n🎉 Integration works!');

    } catch (error) {
        const errorDetails = {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        };

        console.log('\n❌ ERROR:', error.response?.data?.message);
        console.log(JSON.stringify(errorDetails.data, null, 2));

        fs.writeFileSync('shiprocket-error.json', JSON.stringify(errorDetails, null, 2));
    }

    process.exit(0);
}

test();
