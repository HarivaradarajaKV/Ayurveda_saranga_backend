require('dotenv').config();

console.log('Environment Check:');
console.log('SHIPROCKET_EMAIL:', process.env.SHIPROCKET_EMAIL ? 'Set ✓' : 'Missing ✗');
console.log('SHIPROCKET_PASSWORD:', process.env.SHIPROCKET_PASSWORD ? 'Set ✓' : 'Missing ✗');
console.log('SHIPROCKET_API_URL:', process.env.SHIPROCKET_API_URL || 'Not set, using default');

const shiprocketService = require('./services/shiprocket');

async function quickTest() {
    try {
        console.log('\nTesting Shiprocket authentication...');
        const token = await shiprocketService.authenticate();
        console.log('✅ SUCCESS! Shiprocket is connected.');
        console.log('Token received (length):', token.length);
        process.exit(0);
    } catch (error) {
        console.log('❌ FAILED:', error.message);
        process.exit(1);
    }
}

quickTest();
