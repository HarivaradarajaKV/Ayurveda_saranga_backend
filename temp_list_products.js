const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function run() {
    try {
        const res = await pool.query('SELECT id, name, is_new_arrival, category, image_url FROM products ORDER BY id');
        console.log(`Total products found in DB: ${res.rows.length}`);
        
        const targetProducts = [
            'Mustang Men',
            'Forever Youth',
            'No More Acidity',
            'The Joint Family',
            'Body Sure',
            'Healthy Lung',
            'Cardio Care Plus',
            'Complete Women'
        ];

        console.log('\n--- MATCHING TARGET PRODUCTS ---');
        res.rows.forEach(p => {
            const match = targetProducts.find(t => p.name.toLowerCase().includes(t.toLowerCase()));
            if (match) {
                console.log(`ID: ${p.id} | DB Name: "${p.name}" | Matches target: "${match}" | Is New Arrival: ${p.is_new_arrival} | Category: "${p.category}"`);
            }
        });

        console.log('\n--- ALL PRODUCTS LIST ---');
        res.rows.forEach(p => {
            console.log(`- ID: ${p.id} | "${p.name}" | Category: "${p.category}" | Is New Arrival: ${p.is_new_arrival}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
