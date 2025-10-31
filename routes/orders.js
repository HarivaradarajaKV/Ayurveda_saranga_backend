const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const fetch = require('node-fetch');

// Create a new order
router.post('/', auth, async (req, res) => {
    try {
        const { shipping_address, payment_method, items, total_amount } = req.body;
        const user_id = req.user.id;

        // Validate payment method
        if (!['cod', 'online'].includes(payment_method)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        // Start transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (payment_method === 'online') {
                // For online payment, create a temporary order first
                const orderResult = await client.query(
                    `INSERT INTO orders (
                        user_id, 
                        total_amount, 
                        status, 
                        shipping_address_line1, 
                        shipping_address_line2, 
                        shipping_city, 
                        shipping_state, 
                        shipping_postal_code, 
                        shipping_country, 
                        shipping_full_name, 
                        shipping_phone_number,
                        payment_method,
                        payment_method_type,
                        payment_status,
                        is_temporary,
                        delivery_charge,
                        discount_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
                    [
                        user_id,
                        total_amount || 0,
                        'pending_payment',
                        shipping_address.address_line1,
                        shipping_address.address_line2,
                        shipping_address.city,
                        shipping_address.state,
                        shipping_address.postal_code,
                        shipping_address.country,
                        shipping_address.full_name,
                        shipping_address.phone_number,
                        'online',
                        'online',
                        'pending',
                        true,
                        req.body.delivery_charge || 0,
                        req.body.discount_amount || 0
                    ]
                );
                const order_id = orderResult.rows[0].id;
                // Normalize timestamps to IST
                await client.query(
                    "UPDATE orders SET created_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'), updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') WHERE id = $1",
                    [order_id]
                );

                // Insert order items
                for (const item of items) {
                    // Prefer client-provided effective price (already discounted in checkout)
                    let priceAtTime = Number(item.price);
                    if (!isFinite(priceAtTime) || priceAtTime <= 0) {
                        // Fallback to product price minus offer percentage if available
                        const productResult = await client.query(
                            'SELECT price, offer_percentage FROM products WHERE id = $1',
                            [item.product_id]
                        );
                        const dbRow = productResult.rows[0] || { price: 0, offer_percentage: 0 };
                        const offerPct = Number(dbRow.offer_percentage || 0);
                        const basePrice = Number(dbRow.price || 0);
                        priceAtTime = basePrice * (1 - (offerPct / 100));
                    }

                    await client.query(
                        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
                        [order_id, item.product_id, item.quantity, priceAtTime]
                    );
                }

                await client.query('COMMIT');

                // Create Razorpay order
                const razorpayResponse = await fetch(`${process.env.BACKEND_URL}/api/razorpay/create-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': req.headers.authorization
                    },
                    body: JSON.stringify({
                        amount: total_amount,
                        order_id: order_id
                    })
                });

                if (!razorpayResponse.ok) {
                    throw new Error('Failed to create Razorpay order');
                }

                const razorpayOrder = await razorpayResponse.json();

                return res.json({
                    message: 'Order initiated',
                    order: {
                        id: order_id,
                        total_amount: total_amount,
                        status: 'pending_payment',
                        shipping_address,
                        payment_method,
                        razorpay_order: razorpayOrder
                    }
                });
            } else {
                // For COD, create a regular order
                const orderResult = await client.query(
                    `INSERT INTO orders (
                        user_id, 
                        total_amount, 
                        status, 
                        shipping_address_line1, 
                        shipping_address_line2, 
                        shipping_city, 
                        shipping_state, 
                        shipping_postal_code, 
                        shipping_country, 
                        shipping_full_name, 
                        shipping_phone_number,
                        payment_method,
                        payment_method_type,
                        payment_status,
                        is_temporary,
                        delivery_charge,
                        discount_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
                    [
                        user_id,
                        total_amount || 0,
                        'pending',
                        shipping_address.address_line1,
                        shipping_address.address_line2,
                        shipping_address.city,
                        shipping_address.state,
                        shipping_address.postal_code,
                        shipping_address.country,
                        shipping_address.full_name,
                        shipping_address.phone_number,
                        'cod',
                        'cod',
                        'pending',
                        false,
                        req.body.delivery_charge || 0,
                        req.body.discount_amount || 0
                    ]
                );
                const order_id = orderResult.rows[0].id;
                // Normalize timestamps to IST
                await client.query(
                    "UPDATE orders SET created_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'), updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') WHERE id = $1",
                    [order_id]
                );

                // Insert order items and update stock
                for (const item of items) {
                    // Prefer client-provided effective price
                    let priceAtTime = Number(item.price);
                    if (!isFinite(priceAtTime) || priceAtTime <= 0) {
                        const productResult = await client.query(
                            'SELECT price, offer_percentage FROM products WHERE id = $1',
                            [item.product_id]
                        );
                        const dbRow = productResult.rows[0] || { price: 0, offer_percentage: 0 };
                        const offerPct = Number(dbRow.offer_percentage || 0);
                        const basePrice = Number(dbRow.price || 0);
                        priceAtTime = basePrice * (1 - (offerPct / 100));
                    }

                    await client.query(
                        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
                        [order_id, item.product_id, item.quantity, priceAtTime]
                    );

                    // Update stock for COD orders
                    await client.query(
                        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                        [item.quantity, item.product_id]
                    );
                }

                // Clear cart for COD orders
                await client.query(
                    'DELETE FROM cart WHERE user_id = $1',
                    [user_id]
                );

                await client.query('COMMIT');

                return res.json({
                    message: 'Order created successfully',
                    order: {
                        id: order_id,
                        total_amount: total_amount,
                        status: 'pending',
                        shipping_address,
                        payment_method: 'cod'
                    }
                });
            }
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle payment cancellation
router.post('/:id/cancel-payment', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Get the order and verify it belongs to the user
            const orderResult = await client.query(
                'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND is_temporary = true',
                [id, req.user.id]
            );

            if (orderResult.rows.length === 0) {
                throw new Error('Order not found or not a temporary order');
            }

            // Delete order items
            await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);

            // Delete the temporary order
            await client.query('DELETE FROM orders WHERE id = $1', [id]);

            await client.query('COMMIT');

            res.json({ message: 'Order cancelled successfully' });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update order after successful payment
router.post('/:id/payment-success', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { razorpay_payment_id, razorpay_order_id } = req.body;
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get the order and verify it belongs to the user
            const orderResult = await client.query(
                'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND is_temporary = true',
                [id, req.user.id]
            );

            if (orderResult.rows.length === 0) {
                throw new Error('Order not found or not a temporary order');
            }

            // Update order status and mark as permanent
            await client.query(
                "UPDATE orders SET status = $1, payment_status = $2, payment_id = $3, is_temporary = false, payment_method = $4, payment_method_type = $4, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') WHERE id = $5",
                ['confirmed', 'paid', razorpay_payment_id, 'online', id]
            );

            // Update product stock quantities
            const orderItems = await client.query(
                'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
                [id]
            );

            for (const item of orderItems.rows) {
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }

            // Clear user's cart
            await client.query(
                'DELETE FROM cart WHERE user_id = $1',
                [req.user.id]
            );

            await client.query('COMMIT');

            res.json({
                message: 'Payment successful and order confirmed',
                order_id: id
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating order after payment:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's orders
router.get('/', auth, async (req, res) => {
    try {
        const orders = await pool.query(
            `SELECT o.*, 
            CASE 
                WHEN LOWER(o.payment_method) = 'cod' OR LOWER(o.payment_method_type) = 'cod' THEN 'Cash on Delivery'
                ELSE 'Online Payment'
            END as payment_method_display,
            json_agg(json_build_object(
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price_at_time', oi.price_at_time,
                'product_name', p.name
            )) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = $1 AND (o.is_temporary = false OR o.is_temporary IS NULL)
            GROUP BY o.id, o.user_id, o.total_amount, o.status, o.shipping_address_line1, 
                     o.shipping_address_line2, o.shipping_city, o.shipping_state, 
                     o.shipping_postal_code, o.shipping_country, o.shipping_full_name, 
                     o.shipping_phone_number, o.created_at, o.updated_at, o.payment_method, 
                     o.payment_method_type, o.payment_status, o.delivery_charge, 
                     o.discount_amount, o.is_temporary, o.payment_id, o.razorpay_order_id
            ORDER BY o.created_at DESC`,
            [req.user.id]
        );
        
        // Log the payment methods for debugging
        console.log('Orders payment methods:', orders.rows.map(order => ({
            id: order.id,
            payment_method: order.payment_method,
            payment_method_type: order.payment_method_type,
            display: order.payment_method_display
        })));
        
        res.json(orders.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific order with product names
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Received request for order ID:', id);
        console.log('User ID from token:', req.user.id);
        const order = await pool.query(
            `SELECT o.*, 
            CASE 
                WHEN LOWER(o.payment_method) = 'cod' OR LOWER(o.payment_method_type) = 'cod' THEN 'Cash on Delivery'
                ELSE 'Online Payment'
            END as payment_method_display,
            json_agg(json_build_object(
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price_at_time', oi.price_at_time,
                'product_name', p.name
            )) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.id = $1 AND o.user_id = $2 AND (o.is_temporary = false OR o.is_temporary IS NULL)
            GROUP BY o.id, o.user_id, o.total_amount, o.status, o.shipping_address_line1, 
                     o.shipping_address_line2, o.shipping_city, o.shipping_state, 
                     o.shipping_postal_code, o.shipping_country, o.shipping_full_name, 
                     o.shipping_phone_number, o.created_at, o.updated_at, o.payment_method, 
                     o.payment_method_type, o.payment_status, o.delivery_charge, 
                     o.discount_amount, o.is_temporary, o.payment_id, o.razorpay_order_id`,
            [id, req.user.id]
        );

        // Log the payment method for debugging
        if (order.rows[0]) {
            console.log('Order payment method:', {
                id: order.rows[0].id,
                payment_method: order.rows[0].payment_method,
                payment_method_type: order.rows[0].payment_method_type,
                display: order.rows[0].payment_method_display
            });
        }

        if (order.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order.rows[0]);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 