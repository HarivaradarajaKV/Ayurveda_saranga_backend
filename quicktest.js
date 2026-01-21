require('dotenv').config();
const shiprocketService = require('./services/shiprocket');

async function quickTest() {
    try {
        const testData = {
            order_id: 'TEST' + Date.now(),
            order_date: new Date().toISOString().split('T')[0],
            pickup_location: 'warehouse',
            billing_customer_name: 'Test',
            billing_last_name: 'User',
            billing_address: 'Test Address',
            billing_city: 'Bangalore',
            billing_pincode: '560105',
            billing_postcode: '560105',
            billing_state: 'Karnataka',
            billing_country: 'India',
            billing_email: 'test@example.com',
            billing_phone: '9876543210',
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

        console.log('Testing Shiprocket API...\n');
        const response = await shiprocketService.createOrder(testData);

        console.log('✅ SUCCESS!');
        console.log('Order ID:', response.order_id);
        console.log('Shipment ID:', response.shipment_id);
        console.log('\n🎉 Shiprocket integration is WORKING!');

    } catch (error) {
        console.log('❌ FAILED:', error.response?.data?.message);
        console.log('Errors:', JSON.stringify(error.response?.data?.errors, null, 2));
    }

    process.exit(0);
}

quickTest();
