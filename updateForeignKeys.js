const pool = require('./db');
require('dotenv').config();

async function updateForeignKeys() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop existing foreign key constraints
        await client.query(`
            ALTER TABLE cart 
            DROP CONSTRAINT IF EXISTS cart_user_id_fkey,
            DROP CONSTRAINT IF EXISTS cart_product_id_fkey;

            ALTER TABLE wishlist 
            DROP CONSTRAINT IF EXISTS wishlist_user_id_fkey,
            DROP CONSTRAINT IF EXISTS wishlist_product_id_fkey;

            ALTER TABLE orders 
            DROP CONSTRAINT IF EXISTS orders_user_id_fkey;

            ALTER TABLE order_items 
            DROP CONSTRAINT IF EXISTS order_items_order_id_fkey,
            DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
        `);

        // Add new foreign key constraints with cascade behavior
        await client.query(`
            ALTER TABLE cart 
            ADD CONSTRAINT cart_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            ADD CONSTRAINT cart_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

            ALTER TABLE wishlist 
            ADD CONSTRAINT wishlist_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            ADD CONSTRAINT wishlist_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

            ALTER TABLE orders 
            ADD CONSTRAINT orders_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

            ALTER TABLE order_items 
            ADD CONSTRAINT order_items_order_id_fkey 
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            ADD CONSTRAINT order_items_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
        `);

        await client.query('COMMIT');
        console.log('Foreign key constraints updated successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating foreign key constraints:', error);
        throw error;
    } finally {
        client.release();
    }
}

updateForeignKeys()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    }); 