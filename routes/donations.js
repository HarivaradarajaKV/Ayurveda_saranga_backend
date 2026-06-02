const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/donations — Admin: list all donations with filters
router.get('/', adminAuth, async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT id, razorpay_order_id, razorpay_payment_id,
                   amount_rupees, currency, donor_name, is_anonymous,
                   payment_status, created_at, updated_at
            FROM donations
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` WHERE payment_status = $${params.length}`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), Number(offset));

        const result = await pool.query(query, params);

        // Total count for pagination
        let countQuery = 'SELECT COUNT(*) FROM donations';
        const countParams = [];
        if (status) {
            countParams.push(status);
            countQuery += ` WHERE payment_status = $1`;
        }
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            donations: result.rows,
            total: Number(countResult.rows[0].count),
            limit: Number(limit),
            offset: Number(offset),
        });
    } catch (error) {
        console.error('Error fetching donations:', error);
        res.status(500).json({ error: 'Failed to fetch donations' });
    }
});

// GET /api/donations/stats — Admin: aggregated donation statistics
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*)                                              AS total_donations,
                COUNT(*) FILTER (WHERE payment_status = 'paid')      AS paid_count,
                COUNT(*) FILTER (WHERE payment_status = 'pending')   AS pending_count,
                COALESCE(SUM(amount_rupees) FILTER (WHERE payment_status = 'paid'), 0) AS total_amount_collected
            FROM donations
        `);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching donation stats:', error);
        res.status(500).json({ error: 'Failed to fetch donation stats' });
    }
});

// GET /api/donations/:id — Admin: get a single donation record
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM donations WHERE id = $1',
            [req.params.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Donation not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching donation:', error);
        res.status(500).json({ error: 'Failed to fetch donation' });
    }
});

module.exports = router;
