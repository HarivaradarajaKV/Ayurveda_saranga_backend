const pool = require('./db');
require('dotenv').config();

async function updateProductCategories() {
    try {
        // Get all products that don't have a category_id
        const products = await pool.query(`
            SELECT id, category FROM products 
            WHERE category_id IS NULL
        `);

        console.log(`Found ${products.rows.length} products to update`);

        for (const product of products.rows) {
            // Try to find matching category
            const category = await pool.query(`
                SELECT id FROM categories 
                WHERE LOWER(name) = LOWER($1)
                OR $1 ILIKE ANY (
                    SELECT name FROM categories
                    WHERE parent_id IS NOT NULL
                )
            `, [product.category]);

            if (category.rows.length > 0) {
                // Update product with category_id
                await pool.query(`
                    UPDATE products 
                    SET category_id = $1 
                    WHERE id = $2
                `, [category.rows[0].id, product.id]);
                console.log(`Updated product ${product.id} with category_id ${category.rows[0].id}`);
            } else {
                console.log(`No matching category found for product ${product.id} with category "${product.category}"`);
            }
        }

        console.log('Product categories update completed');
        process.exit(0);
    } catch (error) {
        console.error('Error updating product categories:', error);
        process.exit(1);
    }
}

updateProductCategories(); 