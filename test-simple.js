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
        console.log('Phone:', order.shipping_phone_number);
        console.log('Pincode:', order.shipping_postal_code);
        console.log('City:', order.shipping_city);
        console.log('State:', order.shipping_state);

        const testData = {
            order_id: order.id.toString(),
            order_date: new Date().toISOString().split('T')[0],
            pickup_location: 'warehouse',
            billing_customer_name: order.shipping_full_name,
            billing_address: order.shipping_address_line1,
            billing_city: order.shipping_city,
            billing_pincode: order.shipping_postal_code,
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

        console.log('SUCCESS!');
        console.log('Order ID:', response.order_id);
        console.log('Shipment ID:', response.shipment_id);

    } catch (error) {
        const errorDetails = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        };

        console.log('\nERROR:', error.response?.data?.message);
        console.log('\nERROR DETAILS:');
        console.log(JSON.stringify(errorDetails, null, 2));

        fs.writeFileSync('shiprocket-error.json', JSON.stringify(errorDetails, null, 2));
        console.log('\nFull error saved to shiprocket-error.json');
    }

    process.exit(0);
}

test();
