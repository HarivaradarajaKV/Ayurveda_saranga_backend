const pool = require('../db');

async function testQuery() {
    try {
        console.log('Testing best_sellers admin query...');
        const result = await pool.query(`
            SELECT 
                p.id, 
                p.name, 
                p.price, 
                p.image_url, 
                CASE WHEN bs.product_id IS NOT NULL THEN true ELSE false END as is_best_seller, 
                p.category_id,
                COALESCE(
                    (
                        SELECT json_agg(category_id)
                        FROM product_categories
                        WHERE product_id = p.id
                    ),
                    '[]'::json
                ) as category_ids
            FROM products p
            LEFT JOIN best_sellers bs ON p.id = bs.product_id
            ORDER BY p.name ASC
        `);
        console.log('Query successful! Row count:', result.rows.length);
        if (result.rows.length > 0) {
            console.log('First row sample:', result.rows[0]);
        }
        process.exit(0);
    } catch (err) {
        console.error('Query failed with error:', err);
        process.exit(1);
    }
}

testQuery();
