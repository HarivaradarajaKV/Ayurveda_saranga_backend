const router = require('express').Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get available coupons
router.get('/', async (req, res) => {
    try {
        const coupons = await pool.query(`
            SELECT 
                c.id,
                c.code,
                c.description,
                c.discount_type,
                c.discount_value,
                c.min_purchase_amount,
                c.max_discount_amount,
                c.start_date,
                c.end_date,
                c.is_active,
                ARRAY_AGG(DISTINCT p.id) as product_ids,
                ARRAY_AGG(DISTINCT p.name) as product_names
            FROM coupons c
            LEFT JOIN coupon_products cp ON c.id = cp.coupon_id
            LEFT JOIN products p ON cp.product_id = p.id
            WHERE c.is_active = true
            AND c.start_date <= CURRENT_TIMESTAMP
            AND c.end_date >= CURRENT_TIMESTAMP
            AND (c.usage_limit IS NULL OR c.times_used < c.usage_limit)
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        res.json(coupons.rows);
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ error: 'Failed to fetch coupons' });
    }
});

// Validate coupon
router.post('/validate', auth, async (req, res) => {
    try {
        const { code, products } = req.body;
        
        // Get coupon details
        const couponResult = await pool.query(`
            SELECT 
                c.*,
                ARRAY_AGG(cp.product_id) as applicable_products
            FROM coupons c
            LEFT JOIN coupon_products cp ON c.id = cp.coupon_id
            WHERE UPPER(c.code) = UPPER($1)
            GROUP BY c.id
        `, [code]);

        if (couponResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid coupon code' });
        }

        const coupon = couponResult.rows[0];

        // Check if coupon is active
        if (!coupon.is_active) {
            return res.status(400).json({ error: 'This coupon is no longer active' });
        }

        // Check if coupon has expired
        const now = new Date();
        if (now < new Date(coupon.start_date) || now > new Date(coupon.end_date)) {
            return res.status(400).json({ error: 'This coupon has expired' });
        }

        // Check usage limit
        if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
            return res.status(400).json({ error: 'This coupon has reached its usage limit' });
        }

        // Calculate total amount and check minimum purchase requirement
        let totalAmount = 0;
        let applicableAmount = 0;
        
        for (const product of products) {
            const productResult = await pool.query(
                'SELECT price FROM products WHERE id = $1',
                [product.id]
            );
            
            if (productResult.rows.length > 0) {
                const price = productResult.rows[0].price * product.quantity;
                totalAmount += price;
                
                // Check if product is applicable for the coupon
                if (coupon.applicable_products.includes(product.id) || 
                    coupon.applicable_products.length === 0) {
                    applicableAmount += price;
                }
            }
        }

        if (totalAmount < coupon.min_purchase_amount) {
            return res.status(400).json({
                error: `Minimum purchase amount of ₹${coupon.min_purchase_amount} required`
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (coupon.discount_type === 'percentage') {
            discountAmount = (applicableAmount * coupon.discount_value) / 100;
            if (coupon.max_discount_amount) {
                discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
            }
        } else {
            discountAmount = Math.min(coupon.discount_value, applicableAmount);
        }

        res.json({
            valid: true,
            coupon: {
                ...coupon,
                discount_amount: discountAmount
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Apply coupon to cart
router.post('/apply', auth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { code, cart_items } = req.body;
        const user_id = req.user.id;

        await client.query('BEGIN');

        // Validate coupon
        const validationResult = await client.query(`
            SELECT 
                c.*,
                ARRAY_AGG(cp.product_id) as applicable_products
            FROM coupons c
            LEFT JOIN coupon_products cp ON c.id = cp.coupon_id
            WHERE UPPER(c.code) = UPPER($1)
            GROUP BY c.id
        `, [code]);

        if (validationResult.rows.length === 0) {
            throw new Error('Invalid coupon code');
        }

        const coupon = validationResult.rows[0];

        // Perform all validation checks
        if (!coupon.is_active) {
            throw new Error('This coupon is no longer active');
        }

        const now = new Date();
        if (now < new Date(coupon.start_date) || now > new Date(coupon.end_date)) {
            throw new Error('This coupon has expired');
        }

        if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
            throw new Error('This coupon has reached its usage limit');
        }

        // Calculate discount for each cart item
        let totalAmount = 0;
        let totalDiscount = 0;
        const updatedItems = [];

        for (const item of cart_items) {
            const productResult = await client.query(
                'SELECT price FROM products WHERE id = $1',
                [item.product_id]
            );

            if (productResult.rows.length > 0) {
                const price = productResult.rows[0].price * item.quantity;
                totalAmount += price;

                let itemDiscount = 0;
                if (coupon.applicable_products.includes(item.product_id) || 
                    coupon.applicable_products.length === 0) {
                    if (coupon.discount_type === 'percentage') {
                        itemDiscount = (price * coupon.discount_value) / 100;
                    } else {
                        itemDiscount = coupon.discount_value * (price / totalAmount);
                    }
                }

                updatedItems.push({
                    ...item,
                    discount: itemDiscount
                });
                totalDiscount += itemDiscount;
            }
        }

        if (totalAmount < coupon.min_purchase_amount) {
            throw new Error(`Minimum purchase amount of ₹${coupon.min_purchase_amount} required`);
        }

        // Apply maximum discount limit if applicable
        if (coupon.max_discount_amount && totalDiscount > coupon.max_discount_amount) {
            const discountRatio = coupon.max_discount_amount / totalDiscount;
            updatedItems.forEach(item => {
                item.discount *= discountRatio;
            });
            totalDiscount = coupon.max_discount_amount;
        }

        // Update cart items with applied discount
        for (const item of updatedItems) {
            await client.query(`
                UPDATE cart 
                SET discount_amount = $1
                WHERE user_id = $2 AND product_id = $3
            `, [item.discount, user_id, item.product_id]);
        }

        // Increment coupon usage
        await client.query(`
            UPDATE coupons 
            SET times_used = times_used + 1
            WHERE id = $1
        `, [coupon.id]);

        await client.query('COMMIT');

        res.json({
            success: true,
            items: updatedItems,
            total_discount: totalDiscount
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router; 