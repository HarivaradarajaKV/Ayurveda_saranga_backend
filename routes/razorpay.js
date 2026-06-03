const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const { auth } = require('../middleware/auth');
const pool = require('../db');

// Prefer environment variables but fall back to provided live credentials so payments keep working
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_RhzLf3BDT0rwrF';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'sFPjLlXXCGcreC1NifHOakJh';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.warn('[RAZORPAY] Missing env vars; using embedded live credentials. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment for better security.');
}

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

// ─── Donations ────────────────────────────────────────────────────────────────
// These two routes require NO authentication so they work for:
//   • Anonymous donors (not logged in)
//   • Vercel serverless deployments (no self-looping fetch needed)
// All donation records are stored in the `donations` table, completely separate
// from the `orders` table used for product purchases.

// Step 1 – Create a Razorpay order for a donation and persist a pending record
router.post('/create-donation', async (req, res) => {
    try {
        const { amount, donor_name, is_anonymous, donor_phone } = req.body;

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid donation amount' });
        }

        const amountPaise = Math.round(Number(amount) * 100);
        const resolvedName = is_anonymous ? 'Anonymous' : (donor_name || 'Anonymous');

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: `donation_${Date.now()}`,
            payment_capture: 1,
            notes: {
                type: 'DONATION',            // easily distinguishable in Razorpay dashboard
                donor_name: resolvedName,
                donor_phone: donor_phone || '',
            },
        });

        // Persist pending donation row in DB
        const dbResult = await pool.query(
            `INSERT INTO donations
                (razorpay_order_id, amount_paise, amount_rupees, currency, donor_name, is_anonymous, donor_phone, payment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
             RETURNING id`,
            [order.id, amountPaise, Number(amount), order.currency, resolvedName, Boolean(is_anonymous), donor_phone || null]
        );

        const donationId = dbResult.rows[0].id;

        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key: RAZORPAY_KEY_ID,
            key_id: RAZORPAY_KEY_ID,
            donation_id: donationId,   // returned so the frontend can verify after payment
        });
    } catch (error) {
        console.error('Error creating donation order:', error);
        res.status(500).json({ error: error.message || 'Failed to create donation order' });
    }
});

// Step 2 – Verify Razorpay signature for a donation and mark it as paid
router.post('/verify-donation-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donation_id } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !donation_id) {
            return res.status(400).json({ error: 'Missing required payment verification fields' });
        }

        // Verify HMAC signature
        const crypto = require('crypto');
        const generated_signature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // Update donation record to paid
        const result = await pool.query(
            `UPDATE donations
             SET payment_status      = 'paid',
                 razorpay_payment_id = $1,
                 razorpay_signature  = $2,
                 updated_at          = NOW()
             WHERE id = $3
             RETURNING *`,
            [razorpay_payment_id, razorpay_signature, donation_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Donation record not found' });
        }

        res.json({
            success: true,
            message: 'Donation payment verified and recorded',
            donation: result.rows[0],
        });
    } catch (error) {
        console.error('Error verifying donation payment:', error);
        res.status(500).json({ error: error.message || 'Payment verification failed' });
    }
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
            key: RAZORPAY_KEY_ID,
            key_id: RAZORPAY_KEY_ID
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
        const secret = RAZORPAY_KEY_SECRET;
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