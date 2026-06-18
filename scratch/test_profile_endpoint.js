const pool = require('../db');

async function testDashboard() {
    try {
        const userId = 75;

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
            WHERE o.user_id = $1 AND (o.is_temporary = false OR o.is_temporary IS NULL)
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
            WHERE user_id = $1 AND (is_temporary = false OR is_temporary IS NULL)
        `, [userId]);

        // Get recently viewed products
        const recentlyViewed = await pool.query(`
            SELECT DISTINCT 
                p.*,
                o.created_at as order_date
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.user_id = $1 AND (o.is_temporary = false OR o.is_temporary IS NULL)
            ORDER BY order_date DESC
            LIMIT 5
        `, [userId]);

        const dashboardData = {
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
        };

        console.log('Dashboard Data returned successfully:');
        console.log(JSON.stringify(dashboardData, null, 2));
        pool.end();
    } catch (err) {
        console.error('Error running dashboard query:', err);
        pool.end();
    }
}

testDashboard();
