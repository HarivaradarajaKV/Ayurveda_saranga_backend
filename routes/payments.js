const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// GET payment methods
router.get('/payment-methods', auth, (req, res) => {
    try {
        // For now, return static payment methods
        // In a production environment, these would typically come from your payment provider
        const paymentMethods = [
            {
                id: 'card',
                name: 'Credit/Debit Card',
                description: 'Pay with Visa, Mastercard, or other cards',
                enabled: true
            },
            {
                id: 'cod',
                name: 'Cash on Delivery',
                description: 'Pay when you receive your order',
                enabled: true
            }
        ];

        res.json(paymentMethods);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router; 