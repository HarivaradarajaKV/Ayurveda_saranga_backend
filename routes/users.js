const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const userProfile = await pool.query(
            'SELECT id, name, email, phone, photo_url, created_at FROM users WHERE id = $1',
            [userId]
        );

        if (userProfile.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(userProfile.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user dashboard data
router.get('/dashboard', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user profile
        const userProfile = await pool.query(
            'SELECT id, name, email, phone, photo_url, created_at FROM users WHERE id = $1',
            [userId]
        );

        // Get recent orders
        const recentOrders = await pool.query(`
            SELECT 
                o.*,
                json_agg(json_build_object(
                    'product_id', oi.product_id,
                    'product_name', p.name,
                    'quantity', oi.quantity,
                    'price', oi.price_at_time
                )) as items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = $1
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT 5
        `, [userId]);

        // Get wishlist count
        const wishlistCount = await pool.query(
            'SELECT COUNT(*) FROM wishlist WHERE user_id = $1',
            [userId]
        );

        // Get cart items count
        const cartCount = await pool.query(
            'SELECT COUNT(*) FROM cart WHERE user_id = $1',
            [userId]
        );

        // Get total orders and spending
        const orderStats = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0) as total_spent
            FROM orders 
            WHERE user_id = $1
        `, [userId]);

        // Get recently viewed products with fixed query
        const recentlyViewed = await pool.query(`
            SELECT DISTINCT 
                p.*,
                o.created_at as order_date
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.user_id = $1
            ORDER BY order_date DESC
            LIMIT 5
        `, [userId]);

        res.json({
            profile: userProfile.rows[0],
            stats: {
                totalOrders: parseInt(orderStats.rows[0].total_orders),
                totalSpent: parseFloat(orderStats.rows[0].total_spent),
                wishlistCount: parseInt(wishlistCount.rows[0].count),
                cartCount: parseInt(cartCount.rows[0].count)
            },
            recentOrders: recentOrders.rows,
            recentlyViewed: recentlyViewed.rows.map(product => {
                const { order_date, ...productData } = product;
                return productData;
            })
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const userId = req.user.id;

        // Check if email is already taken by another user
        if (email) {
            const existingUser = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, userId]
            );
            if (existingUser.rows.length > 0) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Validate phone number format if provided
        if (phone && !/^\d{10}$/.test(phone.replace(/[-\s]/g, ''))) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit phone number' });
        }

        const updatedUser = await pool.query(
            'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, name, email, phone, photo_url, created_at',
            [name, email, phone, userId]
        );

        res.json(updatedUser.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Profile photo upload endpoint
router.post('/profile/photo', auth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const userId = req.user.id;
        const photoUrl = `${req.protocol}://${req.get('host')}/uploads/profile-photos/${req.file.filename}`;

        // Get the old photo URL to delete the file later
        const oldPhoto = await pool.query(
            'SELECT photo_url FROM users WHERE id = $1',
            [userId]
        );

        // Update user's photo_url in database
        const result = await pool.query(
            'UPDATE users SET photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING photo_url',
            [photoUrl, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        // Delete old photo file if it exists
        if (oldPhoto.rows[0]?.photo_url) {
            const oldPhotoPath = oldPhoto.rows[0].photo_url.split('/uploads/')[1];
            if (oldPhotoPath) {
                const fullPath = path.join('uploads', oldPhotoPath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        }

        res.json({ photo_url: result.rows[0].photo_url });
    } catch (error) {
        console.error('Error uploading profile photo:', error);
        res.status(500).json({ error: 'Failed to upload profile photo' });
    }
});

module.exports = router; 