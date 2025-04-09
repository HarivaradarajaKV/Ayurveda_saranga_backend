const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get user's cart
router.get('/', auth, async (req, res) => {
    try {
        const cart = await pool.query(
            'SELECT c.*, p.name, p.price, p.image_url FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1',
            [req.user.id]
        );
        res.json(cart.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add item to cart
router.post('/', auth, async (req, res) => {
    try {
        const { product_id, quantity } = req.body;
        
        // Check if item already in cart
        const existingItem = await pool.query(
            'SELECT * FROM cart WHERE user_id = $1 AND product_id = $2',
            [req.user.id, product_id]
        );
        
        if (existingItem.rows.length > 0) {
            // Update quantity
            const updatedItem = await pool.query(
                'UPDATE cart SET quantity = quantity + $1 WHERE user_id = $2 AND product_id = $3 RETURNING *',
                [quantity, req.user.id, product_id]
            );
            return res.json(updatedItem.rows[0]);
        }
        
        // Add new item
        const newItem = await pool.query(
            'INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, product_id, quantity]
        );
        
        res.json(newItem.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update cart item quantity
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        
        const updatedItem = await pool.query(
            'UPDATE cart SET quantity = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [quantity, id, req.user.id]
        );
        
        if (updatedItem.rows.length === 0) {
            return res.status(404).json({ error: 'Cart item not found' });
        }
        
        res.json(updatedItem.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle item selection
router.put('/:id/select', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { selected } = req.body;
        
        const updatedItem = await pool.query(
            'UPDATE cart SET selected = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [selected, id, req.user.id]
        );
        
        if (updatedItem.rows.length === 0) {
            return res.status(404).json({ error: 'Cart item not found' });
        }
        
        res.json(updatedItem.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear entire cart
router.delete('/clear', auth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM cart WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json({ message: 'Cart cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove item from cart
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedItem = await pool.query(
            'DELETE FROM cart WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.id]
        );
        
        if (deletedItem.rows.length === 0) {
            return res.status(404).json({ error: 'Cart item not found' });
        }
        
        res.json({ message: 'Item removed from cart' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 