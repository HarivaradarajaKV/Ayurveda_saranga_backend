const pool = require('../db');

const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart(product_id);',
    'CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);',
    'CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);',
    'CREATE INDEX IF NOT EXISTS idx_order_items_coupon_id ON order_items(coupon_id);',
    'CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);',
    'CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);'
];

async function createIndexes() {
    try {
        console.log('--- Creating Missing Indexes ---');
        for (const sql of indexes) {
            console.log(`Executing: ${sql}`);
            const start = Date.now();
            await pool.query(sql);
            console.log(`Success in ${Date.now() - start}ms`);
        }
        console.log('\nAll indexes checked/created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error creating indexes:', err);
        process.exit(1);
    }
}

createIndexes();
