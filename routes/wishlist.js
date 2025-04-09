const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get user's wishlist
router.get('/', auth, async (req, res) => {
    try {
        const wishlist = await pool.query(
            `SELECT w.*, p.name, p.price, p.description, p.image_url, p.category 
            FROM wishlist w 
            JOIN products p ON w.product_id = p.id 
            WHERE w.user_id = $1`,
            [req.user.id]
        );
        res.json(wishlist.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add item to wishlist
router.post('/', auth, async (req, res) => {
    try {
        const { product_id } = req.body;

        // Check if item already in wishlist
        const existingItem = await pool.query(
            'SELECT * FROM wishlist WHERE user_id = $1 AND product_id = $2',
            [req.user.id, product_id]
        );

        if (existingItem.rows.length > 0) {
            return res.status(400).json({ error: 'Item already in wishlist' });
        }

        // Add to wishlist
        const newItem = await pool.query(
            'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) RETURNING *',
            [req.user.id, product_id]
        );

        res.json(newItem.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove item from wishlist
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedItem = await pool.query(
            'DELETE FROM wishlist WHERE product_id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.id]
        );

        if (deletedItem.rows.length === 0) {
            return res.status(404).json({ error: 'Item not found in wishlist' });
        }

        res.json({ message: 'Item removed from wishlist' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 