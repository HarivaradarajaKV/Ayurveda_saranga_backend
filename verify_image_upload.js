
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:5001/api';

async function verifyImageUpload() {
    try {
        console.log('1. Logging in as Admin...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD
        });
        const token = loginRes.data.token;
        console.log('Login successful. Token:', token ? token.substring(0, 10) + '...' : 'undefined');
        if (!token) throw new Error('Login failed to return token');

        console.log('1.5 Fetching a category...');
        const catRes = await axios.get(`${API_URL}/categories`);
        const categoryId = catRes.data[0].id;
        console.log('Using Category ID:', categoryId);

        console.log('2. Creating dummy image file...');
        const dummyPath = path.join(__dirname, 'test_image.jpg');
        fs.writeFileSync(dummyPath, 'This is a test image content');

        console.log('3. Uploading Product with Image...');
        const form = new FormData();
        form.append('name', 'Test Image Upload Product');
        form.append('description', 'Testing Supabase Upload');
        form.append('price', '99');
        form.append('category_id', String(categoryId));
        form.append('stock_quantity', '10');
        form.append('images', fs.createReadStream(dummyPath));

        const config = {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        };

        const uploadRes = await axios.post(`${API_URL}/products`, form, config);

        console.log('Product Created:', uploadRes.data.id);
        console.log('Image URL:', uploadRes.data.image_url);

        if (uploadRes.data.image_url && uploadRes.data.image_url.includes('supabase.co')) {
            console.log('SUCCESS: Image URL is from Supabase.');
        } else {
            console.error('FAILURE: Image URL is NOT from Supabase:', uploadRes.data.image_url);
        }

        // Cleanup
        // Delete the product
        console.log('4. Cleaning up...');
        await axios.delete(`${API_URL}/products/${uploadRes.data.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fs.unlinkSync(dummyPath);
        console.log('Cleanup done.');

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

verifyImageUpload();
