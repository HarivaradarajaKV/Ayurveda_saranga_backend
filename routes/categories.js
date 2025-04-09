const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get all categories
router.get('/', async (req, res) => {
    try {
        const categories = await pool.query(`
            SELECT 
                c.*,
                p.name as parent_name,
                COUNT(pr.id) as product_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            LEFT JOIN products pr ON c.id = pr.category_id
            GROUP BY c.id, p.name
            ORDER BY c.name
        `);
        res.json(categories.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category by ID with products
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get category details
        const category = await pool.query(
            'SELECT c.*, p.name as parent_name FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.id = $1',
            [id]
        );
        
        if (category.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Get products in this category
        const products = await pool.query(
            'SELECT * FROM products WHERE category_id = $1',
            [id]
        );

        res.json({
            ...category.rows[0],
            products: products.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 