require('dotenv').config();
const pool = require('./db');
const shiprocketService = require('./services/shiprocket');

async function testShiprocketWithRealOrder() {
    console.log('=== Testing Shiprocket with Real Order Data ===\n');

    try {
        // Get a real order from database
        const orderResult = await pool.query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'name', p.name,
          'sku', p.id,
          'units', oi.quantity,
          'selling_price', oi.price_at_time,
          'discount', 0,
          'tax', oi.gst_amount,
          'hsn', 441122
        )) as items,
        u.email
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.status = 'confirmed'
      GROUP BY o.id, u.email
      LIMIT 1
    `);

        if (orderResult.rows.length === 0) {
            console.log('❌ No confirmed orders found in database');
            process.exit(1);
        }

        const order = orderResult.rows[0];
        console.log('✅ Found order:', order.id);
        console.log('   Customer:', order.shipping_full_name);
        console.log('   Total:', order.total_amount);

        // Prepare Shiprocket order data
        const shiprocketOrderData = {
            order_id: order.id.toString(),
            order_date: new Date(order.created_at).toISOString().split('T')[0],
            pickup_location: 'warehouse', // Your actual pickup location name
            billing_customer_name: order.shipping_full_name,
            billing_address: order.shipping_address_line1,
            billing_address_2: order.shipping_address_line2 || '',
            billing_city: order.shipping_city,
            billing_pincode: order.shipping_postal_code,
            billing_state: order.shipping_state,
            billing_country: order.shipping_country || 'India',
            billing_email: order.email || 'customer@example.com',
            billing_phone: order.shipping_phone_number,
            shipping_is_billing: true,
            order_items: order.items,
            payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
            sub_total: parseFloat(order.total_amount) - parseFloat(order.delivery_charge || 0),
            length: 10,
            breadth: 10,
            height: 10,
            weight: 0.5
        };

        console.log('\n📦 Creating shipment with data:');
        console.log(JSON.stringify(shiprocketOrderData, null, 2));

        console.log('\n🔄 Calling Shiprocket API...\n');

        const shiprocketResponse = await shiprocketService.createOrder(shiprocketOrderData);

        console.log('\n✅ SUCCESS! Shipment created:');
        console.log('   Order ID:', shiprocketResponse.order_id);
        console.log('   Shipment ID:', shiprocketResponse.shipment_id);
        console.log('\n🎉 Integration is working perfectly!');

        process.exit(0);

    } catch (error) {
        console.log('\n❌ ERROR Details:');
        console.log('Error Message:', error.message);
        if (error.response) {
            console.log('Status Code:', error.response.status);
            console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        console.log('\nFull Error:', error);
        process.exit(1);
    }
}

testShiprocketWithRealOrder();
