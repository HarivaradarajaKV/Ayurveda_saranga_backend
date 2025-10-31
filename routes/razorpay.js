const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const { auth } = require('../middleware/auth');
const pool = require('../db');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create a Razorpay order
router.post('/create-order', auth, async (req, res) => {
    try {
        const { amount, order_id } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const options = {
            amount: Math.round(amount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `order_${order_id}_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            // Expose both for compatibility; frontend may read either
            key: process.env.RAZORPAY_KEY_ID,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ error: error.message || 'Failed to create Razorpay order' });
    }
});

// Verify Razorpay payment
router.post('/verify-payment', auth, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;
        
        // Verify the payment signature
        const crypto = require('crypto');
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // Forward the request to the order payment success endpoint (support local and Vercel)
            const protoHeader = req.headers['x-forwarded-proto'];
            const hostHeader = req.headers['x-forwarded-host'] || req.get('host');
            const protocol = (protoHeader && Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || req.protocol || 'https';
            const host = (hostHeader && Array.isArray(hostHeader) ? hostHeader[0] : hostHeader);
            const envBase = process.env.BACKEND_URL || '';
            const isLocalEnv = /localhost|127\.0\.0\.1/.test(envBase);
            const baseUrl = (!envBase || isLocalEnv) && host ? `${protocol}://${host}` : envBase;

            const response = await fetch(`${baseUrl}/api/orders/${order_id}/payment-success`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization
                },
                body: JSON.stringify({
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update order status');
            }

            const result = await response.json();
            res.json(result);
        } else {
            res.status(400).json({ error: 'Invalid payment signature' });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 