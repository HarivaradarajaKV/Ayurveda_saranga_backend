const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const { apiCache } = require('../middleware/apiCache');

// Get all categories
router.get('/', apiCache(30000), async (req, res) => {
    try {
        const categories = await pool.query(`
            SELECT 
                c.*,
                p.name as parent_name,
                COALESCE(pc_counts.p_count, 0) as product_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            LEFT JOIN (
                SELECT category_id, COUNT(*) as p_count 
                FROM products 
                WHERE category_id IS NOT NULL 
                GROUP BY category_id
            ) pc_counts ON c.id = pc_counts.category_id
            WHERE (c.is_active = true OR c.is_active IS NULL OR LOWER(c.status) = 'active' OR c.status IS NULL)
            ORDER BY c.name ASC
        `);
        res.json(categories.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get category by ID or slug with products
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const isInteger = /^\d+$/.test(id);

        let category;
        if (isInteger) {
            category = await pool.query(
                'SELECT c.*, p.name as parent_name FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.id = $1',
                [parseInt(id)]
            );
        } else {
            const cleanSlug = id.toLowerCase().trim();
            category = await pool.query(
                `SELECT c.*, p.name as parent_name 
                 FROM categories c 
                 LEFT JOIN categories p ON c.parent_id = p.id 
                 WHERE LOWER(c.name) = $1
                    OR LOWER(REPLACE(c.name, ' ', '-')) = $1
                    OR LOWER(REPLACE(c.name, '-', ' ')) = $1
                    OR LOWER(REPLACE(REPLACE(c.name, 'CONCERN', 'CARE'), ' ', '-')) = $1
                    OR LOWER(REPLACE(REPLACE(c.name, 'CARE', 'CONCERN'), ' ', '-')) = $1
                 LIMIT 1`,
                [cleanSlug]
            );
        }

        if (category.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const catData = category.rows[0];

        // Get products in this category (primary or secondary via product_categories)
        const products = await pool.query(
            `SELECT DISTINCT p.*, 
                c.name as category_name,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN product_categories pc ON p.id = pc.product_id
             LEFT JOIN reviews r ON p.id = r.product_id
             WHERE p.category_id = $1 OR pc.category_id = $1
             GROUP BY p.id, c.name
             ORDER BY p.created_at DESC`,
            [parseInt(catData.id)]
        );

        res.json({
            ...catData,
            products: products.rows
        });
    } catch (error) {
        console.error('Error fetching category details:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 