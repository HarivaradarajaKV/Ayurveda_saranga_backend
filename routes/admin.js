const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');

// Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role != 'admin') as total_users,
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM orders) as total_orders,
                COALESCE((SELECT SUM(total_amount) FROM orders), 0) as total_revenue
        `);
        
        res.json(stats.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await pool.query(`
            SELECT 
                id, name, email, role, created_at,
                (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as total_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = users.id) as total_spent
            FROM users
            WHERE role != 'admin'
            ORDER BY created_at DESC
        `);
        
        res.json(users.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all products with inventory
router.get('/products', adminAuth, async (req, res) => {
    try {
        const { 
            category_id,
            search,
            priceMin,
            priceMax,
            productTypes,
            skinTypes,
            concerns
        } = req.query;

        let query = `
            SELECT 
                p.*,
                c.name as category_name,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count,
                COUNT(DISTINCT o.id) as order_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN reviews r ON p.id = r.product_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE 1=1
        `;
        const queryParams = [];
        let paramCount = 1;

        // Add filters with proper type casting
        if (category_id) {
            query += ` AND p.category_id = $${paramCount}::integer`;
            queryParams.push(category_id);
            paramCount++;
        }

        if (search) {
            query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        if (priceMin) {
            query += ` AND p.price >= $${paramCount}::numeric`;
            queryParams.push(priceMin);
            paramCount++;
        }

        if (priceMax) {
            query += ` AND p.price <= $${paramCount}::numeric`;
            queryParams.push(priceMax);
            paramCount++;
        }

        if (productTypes) {
            const types = productTypes.split(',');
            query += ` AND p.product_type = ANY($${paramCount}::text[])`;
            queryParams.push(types);
            paramCount++;
        }

        if (skinTypes) {
            const types = skinTypes.split(',');
            query += ` AND p.skin_type = ANY($${paramCount}::text[])`;
            queryParams.push(types);
            paramCount++;
        }

        if (concerns) {
            const concernList = concerns.split(',');
            query += ` AND p.concerns && $${paramCount}::text[]`;
            queryParams.push(concernList);
            paramCount++;
        }

        // Add group by and order by clauses
        query += ` GROUP BY p.id, c.name ORDER BY p.created_at DESC`;

        const products = await pool.query(query, queryParams);
        
        res.json({ products: products.rows });
    } catch (error) {
        console.error('Error in admin products route:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all orders with details
router.get('/orders', adminAuth, async (req, res) => {
    try {
        const orders = await pool.query(`
            SELECT 
                o.*,
                u.name as user_name,
                u.email as user_email,
                json_agg(json_build_object(
                    'product_id', p.id,
                    'product_name', p.name,
                    'quantity', oi.quantity,
                    'price_at_time', oi.price_at_time
                )) as items
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            GROUP BY o.id, o.user_id, o.total_amount, o.status, o.shipping_address_line1, 
                     o.shipping_address_line2, o.shipping_city, o.shipping_state, 
                     o.shipping_postal_code, o.shipping_country, o.shipping_full_name, 
                     o.shipping_phone_number, o.created_at, o.updated_at, o.payment_method, 
                     o.payment_method_type, o.payment_status, o.delivery_charge, 
                     o.discount_amount, o.is_temporary, u.name, u.email
            ORDER BY o.created_at DESC
        `);
        
        res.json(orders.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get product analytics
router.get('/analytics/products', adminAuth, async (req, res) => {
    try {
        const analytics = await pool.query(`
            SELECT 
                p.id,
                p.name,
                p.price,
                COUNT(DISTINCT o.id) as total_orders,
                SUM(oi.quantity) as total_units_sold,
                SUM(oi.quantity * oi.price_at_time) as total_revenue,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count,
                COUNT(DISTINCT w.id) as wishlist_count
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            LEFT JOIN reviews r ON p.id = r.product_id
            LEFT JOIN wishlist w ON p.id = w.product_id
            GROUP BY p.id
            ORDER BY total_revenue DESC
        `);
        
        res.json(analytics.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update order status
router.put('/orders/:id/status', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: `Invalid status. Status must be one of: ${validStatuses.join(', ')}` 
            });
        }
        
        const updatedOrder = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );
        
        if (updatedOrder.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found. Please check the order ID and try again.' });
        }
        
        res.json(updatedOrder.rows[0]);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            error: 'Unable to update order status. Please try again later.' 
        });
    }
});

// Get category management
router.get('/categories', adminAuth, async (req, res) => {
    try {
        const categories = await pool.query(`
            SELECT 
                c.*,
                p.name as parent_name,
                COUNT(DISTINCT pr.id) as product_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            LEFT JOIN products pr ON c.id = pr.category_id
            GROUP BY c.id, p.name
            ORDER BY c.name
        `);
        
        res.json(categories.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new category
router.post('/categories', adminAuth, async (req, res) => {
    try {
        const { name, description, parent_id, image_url } = req.body;
        
        // Check if category name already exists
        const existingCategory = await pool.query(
            'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)',
            [name]
        );
        
        if (existingCategory.rows.length > 0) {
            return res.status(400).json({ error: 'Category name already exists' });
        }
        
        const newCategory = await pool.query(
            'INSERT INTO categories (name, description, parent_id, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description, parent_id, image_url]
        );
        
        res.status(201).json(newCategory.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update category
router.put('/categories/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parent_id, image_url } = req.body;
        
        // Check if new name conflicts with existing categories
        if (name) {
            const existingCategory = await pool.query(
                'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2',
                [name, id]
            );
            
            if (existingCategory.rows.length > 0) {
                return res.status(400).json({ error: 'Category name already exists' });
            }
        }
        
        const updatedCategory = await pool.query(`
            UPDATE categories 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                parent_id = $3,
                image_url = COALESCE($4, image_url)
            WHERE id = $5 
            RETURNING *
        `, [name, description, parent_id, image_url, id]);
        
        if (updatedCategory.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json(updatedCategory.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete category
router.delete('/categories/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if category has subcategories
        const hasSubcategories = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM categories WHERE parent_id = $1)',
            [id]
        );
        
        if (hasSubcategories.rows[0].exists) {
            return res.status(400).json({ 
                error: 'Cannot delete category with existing subcategories' 
            });
        }
        
        // Check if category has products
        const hasProducts = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM products WHERE category_id = $1)',
            [id]
        );
        
        if (hasProducts.rows[0].exists) {
            return res.status(400).json({ 
                error: 'Cannot delete category with existing products' 
            });
        }
        
        const deletedCategory = await pool.query(
            'DELETE FROM categories WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (deletedCategory.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all coupons
router.get('/coupons', adminAuth, async (req, res) => {
    try {
        const coupons = await pool.query(`
            SELECT 
                c.*,
                ARRAY_AGG(DISTINCT p.id) as product_ids,
                ARRAY_AGG(DISTINCT p.name) as product_names
            FROM coupons c
            LEFT JOIN coupon_products cp ON c.id = cp.coupon_id
            LEFT JOIN products p ON cp.product_id = p.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        res.json(coupons.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new coupon
router.post('/coupons', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            code,
            description,
            discount_type,
            discount_value,
            min_purchase_amount,
            max_discount_amount,
            start_date,
            end_date,
            usage_limit,
            product_ids
        } = req.body;

        await client.query('BEGIN');

        // Insert coupon
        const couponResult = await client.query(`
            INSERT INTO coupons (
                code, description, discount_type, discount_value,
                min_purchase_amount, max_discount_amount,
                start_date, end_date, usage_limit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            code.toUpperCase(),
            description,
            discount_type,
            discount_value,
            min_purchase_amount || 0,
            max_discount_amount,
            start_date,
            end_date,
            usage_limit
        ]);

        const coupon = couponResult.rows[0];

        // Add product associations if provided
        if (product_ids && product_ids.length > 0) {
            const values = product_ids.map((product_id, index) => 
                `($1, $${index + 2})`
            ).join(', ');
            
            await client.query(`
                INSERT INTO coupon_products (coupon_id, product_id)
                VALUES ${values}
            `, [coupon.id, ...product_ids]);
        }

        await client.query('COMMIT');
        res.status(201).json(coupon);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Update coupon
router.put('/coupons/:id', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const {
            description,
            discount_type,
            discount_value,
            min_purchase_amount,
            max_discount_amount,
            start_date,
            end_date,
            usage_limit,
            is_active,
            product_ids
        } = req.body;

        await client.query('BEGIN');

        // Update coupon
        const couponResult = await client.query(`
            UPDATE coupons
            SET 
                description = COALESCE($1, description),
                discount_type = COALESCE($2, discount_type),
                discount_value = COALESCE($3, discount_value),
                min_purchase_amount = COALESCE($4, min_purchase_amount),
                max_discount_amount = COALESCE($5, max_discount_amount),
                start_date = COALESCE($6, start_date),
                end_date = COALESCE($7, end_date),
                usage_limit = COALESCE($8, usage_limit),
                is_active = COALESCE($9, is_active)
            WHERE id = $10
            RETURNING *
        `, [
            description,
            discount_type,
            discount_value,
            min_purchase_amount,
            max_discount_amount,
            start_date,
            end_date,
            usage_limit,
            is_active,
            id
        ]);

        if (couponResult.rows.length === 0) {
            return res.status(404).json({ error: 'Coupon not found' });
        }

        // Update product associations if provided
        if (product_ids) {
            await client.query('DELETE FROM coupon_products WHERE coupon_id = $1', [id]);
            
            if (product_ids.length > 0) {
                const values = product_ids.map((_, index) => 
                    `($1, $${index + 2})`
                ).join(', ');
                
                await client.query(`
                    INSERT INTO coupon_products (coupon_id, product_id)
                    VALUES ${values}
                `, [id, ...product_ids]);
            }
        }

        await client.query('COMMIT');
        res.json(couponResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Delete coupon
router.delete('/coupons/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM coupons WHERE id = $1', [id]);
        res.json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 