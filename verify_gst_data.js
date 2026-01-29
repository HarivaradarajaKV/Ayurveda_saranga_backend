const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function verifyGstData() {
    console.log('🔍 Verifying GST Data...');

    try {
        // 1. Check Global GST Rates
        console.log('\n1️⃣  Global GST Rates (gst_rates table):');
        const globalRates = await pool.query('SELECT * FROM gst_rates ORDER BY created_at DESC');
        if (globalRates.rows.length === 0) {
            console.log('   ⚠️  No global GST rates found.');
        } else {
            console.table(globalRates.rows.map(r => ({
                id: r.id,
                name: r.name,
                percentage: r.percentage,
                is_active: r.is_active
            })));
        }

        // 2. Check Product GST Rates
        console.log('\n2️⃣  Product GST Rates (product_gst_rates table):');
        const productRates = await pool.query('SELECT * FROM product_gst_rates LIMIT 5');
        if (productRates.rows.length === 0) {
            console.log('   ⚠️  No individual product GST rates found table seem empty.');
        } else {
            console.table(productRates.rows);
            const count = await pool.query('SELECT COUNT(*) FROM product_gst_rates');
            console.log(`   Total rows in product_gst_rates: ${count.rows[0].count}`);
        }

        // 3. Test the Query used in /gst/products route
        console.log('\n3️⃣  Testing Backend Route Query:');
        const query = `
            SELECT p.id as product_id, p.name as product_name, 
                   COALESCE(g.percentage, (SELECT percentage FROM gst_rates WHERE is_active = true LIMIT 1), 0) as percentage,
                   COALESCE(g.is_active, true) as is_active
            FROM products p
            LEFT JOIN product_gst_rates g ON g.product_id = p.id
            ORDER BY p.name ASC
            LIMIT 5
        `;
        const routeResult = await pool.query(query);
        console.table(routeResult.rows);

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await pool.end();
    }
}

verifyGstData();
