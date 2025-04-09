const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get all brand reviews
router.get('/', async (req, res) => {
    try {
        // First, check if the table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public'
                AND table_name = 'brand_reviews'
            );
        `);

        if (!tableCheck.rows[0].exists) {
            return res.status(404).json({ 
                error: 'Brand reviews table does not exist',
                details: 'The brand_reviews table has not been created yet'
            });
        }

        const reviews = await pool.query(`
            SELECT 
                br.*,
                u.name as user_name,
                COALESCE(u.avatar_url, '') as avatar_url
            FROM brand_reviews br
            JOIN users u ON br.user_id = u.id
            ORDER BY br.created_at DESC
        `);
        
        // Calculate average rating
        const avgRating = await pool.query(`
            SELECT COALESCE(AVG(rating)::numeric(10,1), 0) as average_rating, 
                   COUNT(*) as review_count
            FROM brand_reviews
        `);
        
        res.json({
            reviews: reviews.rows || [],
            average_rating: avgRating.rows[0].average_rating || 0,
            review_count: parseInt(avgRating.rows[0].review_count) || 0
        });
    } catch (error) {
        console.error('Error in GET /brand-reviews:', error);
        
        // Handle specific database errors
        if (error.code === '42P01') {
            return res.status(404).json({ 
                error: 'Table not found',
                details: 'The brand_reviews table does not exist'
            });
        } else if (error.code === '28P01') {
            return res.status(500).json({ 
                error: 'Database authentication failed',
                details: 'Could not connect to the database'
            });
        } else if (error.code === 'ECONNREFUSED') {
            return res.status(500).json({ 
                error: 'Database connection failed',
                details: 'Could not establish connection to the database'
            });
        }
        
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Add a brand review
router.post('/', auth, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const user_id = req.user.id;

        // Check if user has already reviewed
        const existingReview = await pool.query(
            'SELECT * FROM brand_reviews WHERE user_id = $1',
            [user_id]
        );

        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'You have already submitted a brand review' });
        }

        // Add the review
        const newReview = await pool.query(
            'INSERT INTO brand_reviews (user_id, rating, comment) VALUES ($1, $2, $3) RETURNING *',
            [user_id, rating, comment]
        );

        // Get user details for the response
        const user = await pool.query(
            'SELECT name, COALESCE(avatar_url, \'\') as avatar_url FROM users WHERE id = $1',
            [user_id]
        );
        
        const reviewWithUserDetails = {
            ...newReview.rows[0],
            user_name: user.rows[0].name,
            avatar_url: user.rows[0].avatar_url || ''
        };

        res.json(reviewWithUserDetails);
    } catch (error) {
        console.error('Error in POST /brand-reviews:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update a brand review
router.put('/', auth, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const user_id = req.user.id;

        // Check if review exists
        const existingReview = await pool.query(
            'SELECT * FROM brand_reviews WHERE user_id = $1',
            [user_id]
        );

        if (existingReview.rows.length === 0) {
            return res.status(404).json({ error: 'Review not found' });
        }

        // Update the review
        const updatedReview = await pool.query(
            'UPDATE brand_reviews SET rating = $1, comment = $2 WHERE user_id = $3 RETURNING *',
            [rating, comment, user_id]
        );

        // Get user details for the response
        const user = await pool.query('SELECT name, avatar_url FROM users WHERE id = $1', [user_id]);
        
        const reviewWithUserDetails = {
            ...updatedReview.rows[0],
            user_name: user.rows[0].name,
            avatar_url: user.rows[0].avatar_url
        };

        res.json(reviewWithUserDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a brand review
router.delete('/:reviewId', auth, async (req, res) => {
    try {
        const user_id = req.user.id;
        const review_id = req.params.reviewId;

        // First check if the review exists and belongs to the user
        const checkResult = await pool.query(
            'SELECT * FROM brand_reviews WHERE id = $1 AND user_id = $2',
            [review_id, user_id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Review not found or you do not have permission to delete it' });
        }

        // Delete the review
        const result = await pool.query(
            'DELETE FROM brand_reviews WHERE id = $1 AND user_id = $2 RETURNING *',
            [review_id, user_id]
        );

        res.json({ message: 'Review deleted successfully', review: result.rows[0] });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Failed to delete review' });
    }
});

module.exports = router; 