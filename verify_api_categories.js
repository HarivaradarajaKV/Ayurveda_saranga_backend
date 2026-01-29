const axios = require('axios');
require('dotenv').config();

const API_URL = 'http://localhost:5001/api/products';

async function checkProducts() {
    try {
        console.log('Fetching products from:', API_URL);
        const response = await axios.get(API_URL);

        if (response.data && response.data.products && response.data.products.length > 0) {
            const firstProduct = response.data.products[0];
            console.log('First product ID:', firstProduct.id);
            console.log('First product Name:', firstProduct.name);
            console.log('First product Categories:', JSON.stringify(firstProduct.categories, null, 2));

            if (Array.isArray(firstProduct.categories)) {
                console.log('SUCCESS: Categories is an array.');
            } else {
                console.error('FAILURE: Categories is NOT an array.');
            }
        } else {
            console.log('No products found to check.');
        }
    } catch (error) {
        console.error('Error fetching products:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

checkProducts();
