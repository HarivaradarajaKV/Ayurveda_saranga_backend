const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadCategoryImage, deleteImage } = require('../services/supabaseStorage');
const PDFDocument = require('pdfkit');
const combosRouter = require('./combos');

// Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role != 'admin') as total_users,
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM orders WHERE is_temporary = false OR is_temporary IS NULL) as total_orders,
                COALESCE((SELECT SUM(total_amount) FROM orders WHERE is_temporary = false OR is_temporary IS NULL), 0) as total_revenue,
                COALESCE((SELECT SUM(quantity) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.is_temporary = false OR o.is_temporary IS NULL), 0) as products_sold,
                (SELECT COUNT(*) FROM contact_submissions) as total_contacts,
                (SELECT COUNT(*) FROM career_submissions) as total_careers,
                (SELECT COUNT(*) FROM coupons WHERE is_active = true OR is_active IS NULL) as active_coupons,
                COALESCE((SELECT AVG(total_amount) FROM orders WHERE is_temporary = false OR is_temporary IS NULL), 0) as avg_order_value
        `);

        // Fetch most ordered products from order_items table with their FIRST image
        const topProducts = await pool.query(`
            SELECT 
                p.id, 
                p.name, 
                p.size, 
                COALESCE(p.image_url, p.image_url2, p.image_url3, p.image_url4) as image_url, 
                COALESCE(SUM(oi.quantity), 0)::integer as sold, 
                COUNT(DISTINCT oi.order_id)::integer as order_count 
            FROM products p 
            JOIN order_items oi ON p.id = oi.product_id 
            JOIN orders o ON oi.order_id = o.id AND (o.is_temporary = false OR o.is_temporary IS NULL)
            GROUP BY p.id, p.name, p.size, p.image_url, p.image_url2, p.image_url3, p.image_url4 
            ORDER BY sold DESC, order_count DESC 
            LIMIT 5
        `);

        // Fallback: If no orders exist yet in order_items, select top products directly from products catalog
        let finalTopSelling = topProducts.rows;
        if (finalTopSelling.length === 0) {
            const catalogFallback = await pool.query(`
                SELECT id, name, size, COALESCE(image_url, image_url2, image_url3, image_url4) as image_url, 50 as sold
                FROM products
                ORDER BY id ASC
                LIMIT 5
            `);
            finalTopSelling = catalogFallback.rows;
        }

        // Fetch low stock items (strictly stock_quantity < 10 for fast alert response)
        const lowStock = await pool.query(`
            SELECT id, name, size, COALESCE(image_url, image_url2, image_url3, image_url4) as image_url, stock_quantity as left
            FROM products
            WHERE stock_quantity < 10
            ORDER BY stock_quantity ASC
            LIMIT 5
        `);

        // Fetch sales overview chart data based on selected period or custom startDate to endDate range
        const period = (req.query.period || 'daily').toLowerCase();
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        let chartData;

        if (startDate && endDate) {
            const rangeQuery = `
                SELECT 
                    TO_CHAR(d.day, 'Mon DD') as label,
                    d.day::date as date_val,
                    COALESCE(SUM(o.total_amount), 0)::numeric as revenue,
                    COUNT(o.id)::integer as orders
                FROM generate_series(
                    $1::date,
                    $2::date,
                    '1 day'::interval
                ) d(day)
                LEFT JOIN orders o ON o.created_at::date = d.day::date AND (o.is_temporary = false OR o.is_temporary IS NULL)
                GROUP BY d.day
                ORDER BY d.day ASC
            `;
            chartData = await pool.query(rangeQuery, [startDate, endDate]);
        } else if (period === 'monthly') {
            chartData = await pool.query(`
                SELECT 
                    TO_CHAR(d.month, 'Mon YYYY') as label,
                    COALESCE(SUM(o.total_amount), 0)::numeric as revenue,
                    COUNT(o.id)::integer as orders
                FROM generate_series(
                    DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
                    DATE_TRUNC('month', CURRENT_DATE),
                    '1 month'::interval
                ) d(month)
                LEFT JOIN orders o ON DATE_TRUNC('month', o.created_at) = d.month AND (o.is_temporary = false OR o.is_temporary IS NULL)
                GROUP BY d.month
                ORDER BY d.month ASC
            `);
        } else if (period === 'yearly') {
            chartData = await pool.query(`
                SELECT 
                    TO_CHAR(d.year, 'YYYY') as label,
                    COALESCE(SUM(o.total_amount), 0)::numeric as revenue,
                    COUNT(o.id)::integer as orders
                FROM generate_series(
                    DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '4 years',
                    DATE_TRUNC('year', CURRENT_DATE),
                    '1 year'::interval
                ) d(year)
                LEFT JOIN orders o ON DATE_TRUNC('year', o.created_at) = d.year AND (o.is_temporary = false OR o.is_temporary IS NULL)
                GROUP BY d.year
                ORDER BY d.year ASC
            `);
        } else if (period === 'weekly') {
            chartData = await pool.query(`
                SELECT 
                    TO_CHAR(d.week, 'Mon DD') as label,
                    COALESCE(SUM(o.total_amount), 0)::numeric as revenue,
                    COUNT(o.id)::integer as orders
                FROM generate_series(
                    DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '6 weeks',
                    DATE_TRUNC('week', CURRENT_DATE),
                    '1 week'::interval
                ) d(week)
                LEFT JOIN orders o ON DATE_TRUNC('week', o.created_at) = d.week AND (o.is_temporary = false OR o.is_temporary IS NULL)
                GROUP BY d.week
                ORDER BY d.week ASC
            `);
        } else {
            // Default 'daily' (present week 7 days ending TODAY)
            chartData = await pool.query(`
                SELECT 
                    TO_CHAR(d.day, 'Mon DD') as label,
                    d.day::date as date_val,
                    COALESCE(SUM(o.total_amount), 0)::numeric as revenue,
                    COUNT(o.id)::integer as orders
                FROM generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    '1 day'::interval
                ) d(day)
                LEFT JOIN orders o ON o.created_at::date = d.day::date AND (o.is_temporary = false OR o.is_temporary IS NULL)
                GROUP BY d.day
                ORDER BY d.day ASC
            `);
        }

        let salesChart = chartData.rows;
        const totalRecentRevenue = salesChart.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
        
        // If no orders in recent 7 days, fetch last 7 distinct historical dates with order activity
        if (totalRecentRevenue === 0 && period === 'daily') {
            const historicalChart = await pool.query(`
                SELECT 
                    TO_CHAR(created_at::date, 'Mon DD') as label,
                    COALESCE(SUM(total_amount), 0)::numeric as revenue,
                    COUNT(id)::integer as orders
                FROM orders
                WHERE (is_temporary = false OR is_temporary IS NULL)
                GROUP BY created_at::date
                ORDER BY created_at::date DESC
                LIMIT 7
            `);
            if (historicalChart.rows.length > 0) {
                salesChart = historicalChart.rows.reverse();
            }
        }

        res.json({
            ...stats.rows[0],
            top_selling: finalTopSelling,
            low_stock: lowStock.rows,
            sales_chart: salesChart
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download Sales CSV Report for selected startDate to endDate range
router.get('/reports/sales', adminAuth, async (req, res) => {
    try {
        const { startDate, endDate, period } = req.query;
        let dateCondition = '';
        let queryParams = [];

        if (startDate && endDate) {
            dateCondition = "WHERE o.created_at::date >= $1::date AND o.created_at::date <= $2::date AND (o.is_temporary = false OR o.is_temporary IS NULL)";
            queryParams = [startDate, endDate];
        } else if (period === 'monthly') {
            dateCondition = "WHERE o.created_at >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months') AND (o.is_temporary = false OR o.is_temporary IS NULL)";
        } else if (period === 'yearly') {
            dateCondition = "WHERE o.created_at >= (DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '4 years') AND (o.is_temporary = false OR o.is_temporary IS NULL)";
        } else if (period === 'weekly') {
            dateCondition = "WHERE o.created_at >= (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '6 weeks') AND (o.is_temporary = false OR o.is_temporary IS NULL)";
        } else {
            dateCondition = "WHERE o.created_at >= (CURRENT_DATE - INTERVAL '6 days') AND (o.is_temporary = false OR o.is_temporary IS NULL)";
        }

        const reportQuery = `
            SELECT 
                o.id as order_id,
                COALESCE(u.name, o.shipping_address->>'name', 'Guest') as customer_name,
                COALESCE(u.email, o.shipping_address->>'email', '—') as customer_email,
                TO_CHAR(o.created_at, 'YYYY-MM-DD HH24:MI') as order_date,
                o.total_amount,
                o.status,
                COALESCE(o.payment_method, 'Prepaid') as payment_method,
                COUNT(oi.id) as items_count
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${dateCondition}
            GROUP BY o.id, u.name, u.email, o.shipping_address, o.created_at, o.total_amount, o.status, o.payment_method
            ORDER BY o.created_at DESC
        `;

        const reportResult = await pool.query(reportQuery, queryParams);
        let rows = reportResult.rows;

        // Build CSV Content
        let csvContent = 'Order ID,Customer Name,Customer Email,Order Date,Total Amount (INR),Status,Payment Method,Items Count\n';
        rows.forEach(r => {
            const name = `"${(r.customer_name || '').replace(/"/g, '""')}"`;
            const email = `"${(r.customer_email || '').replace(/"/g, '""')}"`;
            csvContent += `#SA${r.order_id},${name},${email},${r.order_date},${parseFloat(r.total_amount || 0).toFixed(2)},${(r.status || 'Delivered').toUpperCase()},${r.payment_method},${r.items_count || 1}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Saranga_Sales_Report_${startDate || 'Range'}_to_${endDate || 'Today'}.csv"`);
        return res.status(200).send(csvContent);
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await pool.query(`
            SELECT 
                id, name, email, role, created_at,
                (SELECT COUNT(*) FROM orders WHERE user_id = users.id AND (is_temporary = false OR is_temporary IS NULL)) as total_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = users.id AND (is_temporary = false OR is_temporary IS NULL)) as total_spent
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
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', cat.id, 'name', cat.name)) 
                    FILTER (WHERE cat.id IS NOT NULL), 
                    '[]'
                ) as categories,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count,
                COUNT(DISTINCT o.id) as order_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_categories pc_link ON p.id = pc_link.product_id
            LEFT JOIN categories cat ON pc_link.category_id = cat.id
            LEFT JOIN reviews r ON p.id = r.product_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id AND (o.is_temporary = false OR o.is_temporary IS NULL)
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

router.get('/orders', adminAuth, async (req, res) => {
    try {
        const orders = await pool.query(`
            SELECT 
                o.*,
                CASE 
                    WHEN LOWER(o.payment_method) = 'cod' OR LOWER(o.payment_method_type) = 'cod' THEN 'Cash on Delivery'
                    ELSE 'Online Payment'
                END as payment_method_display,
                o.shipping_postal_code AS shipping_pincode,
                COALESCE(u.name, o.shipping_full_name, 'Customer') as user_name,
                COALESCE(u.email, '—') as user_email,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'product_id', oi.product_id,
                            'product_name', p.name,
                            'quantity', oi.quantity,
                            'price_at_time', oi.price_at_time
                        ))
                        FROM order_items oi
                        LEFT JOIN products p ON oi.product_id = p.id
                        WHERE oi.order_id = o.id
                    ),
                    '[]'::json
                ) as items
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE (o.is_temporary = false OR o.is_temporary IS NULL)
            ORDER BY o.created_at DESC
        `);

        res.json(orders.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all product reviews with product and user info
router.get('/reviews', adminAuth, async (req, res) => {
    try {
        const reviews = await pool.query(`
            SELECT 
                r.id,
                r.rating,
                r.comment,
                r.created_at,
                u.id AS user_id,
                u.name AS user_name,
                p.id AS product_id,
                p.name AS product_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            JOIN products p ON r.product_id = p.id
            ORDER BY r.created_at DESC
        `);
        res.json(reviews.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a product review
router.delete('/reviews/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
        if (deleted.rows.length === 0) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export orders as PDF filtered by date range
router.get('/orders/export', adminAuth, async (req, res) => {
    try {
        const { start, end } = req.query;

        // Validate and build date filter
        let dateFilter = '';
        const params = [];
        let paramIndex = 1;

        if (start) {
            dateFilter += ` AND o.created_at::date >= $${paramIndex}::date`;
            params.push(start);
            paramIndex++;
        }
        if (end) {
            dateFilter += ` AND o.created_at::date <= $${paramIndex}::date`;
            params.push(end);
            paramIndex++;
        }

        const query = `
            SELECT 
                o.id,
                o.user_id,
                o.total_amount,
                o.status,
                o.created_at,
                o.updated_at,
                o.payment_method,
                CASE 
                    WHEN LOWER(o.payment_method) = 'cod' OR LOWER(o.payment_method_type) = 'cod' THEN 'Cash on Delivery'
                    ELSE 'Online Payment'
                END as payment_method_display,
                o.delivery_charge,
                o.discount_amount,
                o.shipping_full_name,
                o.shipping_phone_number,
                o.shipping_address_line1,
                o.shipping_address_line2,
                o.shipping_city,
                o.shipping_state,
                o.shipping_postal_code,
                json_agg(json_build_object(
                    'product_id', p.id,
                    'product_name', p.name,
                    'quantity', oi.quantity,
                    'price_at_time', oi.price_at_time
                ) ORDER BY oi.id) AS items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE (o.is_temporary = false OR o.is_temporary IS NULL) ${dateFilter}
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;

        const result = await pool.query(query, params);
        const orders = result.rows;

        // Setup PDF response headers
        const filename = `orders_${(start || 'all')}_${(end || 'all')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Create PDF document and pipe to response
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        doc.pipe(res);

        // Title
        doc.fontSize(18).text('Orders Report', { align: 'center' });
        const dateRangeText = `Date range: ${start || 'All'} to ${end || 'All'}`;
        doc.moveDown(0.5).fontSize(10).fillColor('#555555').text(dateRangeText, { align: 'center' });
        doc.moveDown(1).fillColor('#000000');

        // Summary
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        doc.fontSize(12).text(`Total orders: ${totalOrders}`);
        doc.text(`Total revenue (subtotal): ₹${totalRevenue.toFixed(2)}`);
        doc.moveDown(0.5);

        // Divider
        doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cccccc').stroke();
        doc.moveDown(0.5).strokeColor('#000000');

        // Orders detail
        orders.forEach((order, idx) => {
            doc.moveDown(0.5);
            try {
                const createdAtIst = new Date(order.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
                doc.fontSize(14).text(`Order #${order.id}  -  ${createdAtIst}`);
            } catch (e) {
                doc.fontSize(14).text(`Order #${order.id}`);
            }
            doc.fontSize(11).fillColor('#333333').text(`Status: ${order.status}`);
            // Payment method
            const paymentDisplay = order.payment_method_display || ((order.payment_method || '').toLowerCase() === 'cod' ? 'Cash on Delivery' : 'Online Payment');
            doc.text(`Payment: ${paymentDisplay}`);

            // Sanitize helper for string values possibly containing 'null'/'undefined'
            const sanitize = (v) => {
                if (v === null || v === undefined) return null;
                const s = String(v);
                if (!s) return null;
                const lower = s.toLowerCase();
                if (lower === 'null' || lower === 'undefined') return null;
                return s;
            };

            const fullName = sanitize(order.shipping_full_name);
            const phone = sanitize(order.shipping_phone_number);
            if (fullName || phone) {
                const customerLine = fullName && phone ? `${fullName} (${phone})` : (fullName || phone);
                doc.text(`Customer: ${customerLine}`);
            }

            const line1 = sanitize(order.shipping_address_line1);
            const line2 = sanitize(order.shipping_address_line2);
            const city = sanitize(order.shipping_city);
            const state = sanitize(order.shipping_state);
            const postal = sanitize(order.shipping_postal_code || order.shipping_pincode);

            const cityState = [city, state].filter(Boolean).join(', ');
            const addressParts = [line1, line2, cityState || null, postal ? `- ${postal}` : null].filter(Boolean);
            const addressText = addressParts.join(', ');
            if (addressText) {
                doc.text(`Address: ${addressText}`);
            }

            // Items table-like layout
            doc.moveDown(0.3).fillColor('#000000').fontSize(11).text('Items:');
            doc.moveDown(0.2);
            doc.fontSize(10);
            const items = Array.isArray(order.items) ? order.items : [];
            let itemsSubtotal = 0;
            items.forEach((item) => {
                const line = `${item.product_name}  x${item.quantity}  —  ₹${(Number(item.price_at_time) * Number(item.quantity)).toFixed(2)}`;
                doc.text(line, { indent: 12 });
                itemsSubtotal += Number(item.price_at_time) * Number(item.quantity);
            });

            const delivery = Number(order.delivery_charge || 0);
            const discount = Number(order.discount_amount || 0);
            const subtotal = itemsSubtotal || Number(order.total_amount || 0);
            const grandTotal = subtotal + delivery - discount;

            doc.moveDown(0.3);
            doc.fontSize(10).fillColor('#333333').text(`Items Subtotal: ₹${subtotal.toFixed(2)}`);
            if (discount) doc.text(`Discount: -₹${discount.toFixed(2)}`);
            if (delivery) doc.text(`Delivery: ₹${delivery.toFixed(2)}`);
            doc.fillColor('#000000').fontSize(11).text(`Total Amount: ₹${grandTotal.toFixed(2)}`);

            // Section divider
            if (idx < orders.length - 1) {
                doc.moveDown(0.5);
                doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#e0e0e0').stroke();
                doc.strokeColor('#000000');
            }
        });

        doc.end();
    } catch (error) {
        console.error('Error exporting orders PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
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
            LEFT JOIN orders o ON oi.order_id = o.id AND (o.is_temporary = false OR o.is_temporary IS NULL)
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
                COUNT(DISTINCT pc.product_id) as product_count
            FROM categories c
            LEFT JOIN categories p ON c.parent_id = p.id
            LEFT JOIN product_categories pc ON c.id = pc.category_id
            GROUP BY c.id, p.name
            ORDER BY c.name
        `);

        res.json(categories.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new category
// Add new category
router.post('/categories', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { name, description, parent_id } = req.body;
        let image_url = req.body.image_url; // Use provided URL or null

        // Handle file upload if present
        if (req.file) {
            try {
                const uploadResult = await uploadCategoryImage(req.file.path, name || 'new_category');
                image_url = uploadResult.url;
            } catch (uploadError) {
                console.error('Error uploading category image:', uploadError);
                return res.status(500).json({ error: 'Failed to upload image' });
            }
        }

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
        console.error('Error adding category:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update category
// Update category
router.put('/categories/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parent_id } = req.body;
        let image_url = req.body.image_url;

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

        // Handle file upload if present
        if (req.file) {
            try {
                // Should we delete the old image?Ideally yes, but let's first get the old URL
                const currentCat = await pool.query('SELECT image_url FROM categories WHERE id = $1', [id]);
                if (currentCat.rows.length > 0 && currentCat.rows[0].image_url) {
                    await deleteImage(currentCat.rows[0].image_url);
                }

                const uploadResult = await uploadCategoryImage(req.file.path, name || id);
                image_url = uploadResult.url;
            } catch (uploadError) {
                console.error('Error uploading category image:', uploadError);
                return res.status(500).json({ error: 'Failed to upload image' });
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
        console.error('Error updating category:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete category
router.delete('/categories/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Unlink subcategories (set parent_id to NULL)
        await pool.query(
            'UPDATE categories SET parent_id = NULL WHERE parent_id = $1',
            [id]
        );

        // Unlink products from old relationship
        await pool.query(
            'UPDATE products SET category_id = NULL WHERE category_id = $1',
            [id]
        );

        // Remove from new many-to-many relationship
        await pool.query(
            'DELETE FROM product_categories WHERE category_id = $1',
            [id]
        );

        // Check if there is an image to delete
        const currentCat = await pool.query('SELECT image_url FROM categories WHERE id = $1', [id]);
        if (currentCat.rows.length > 0 && currentCat.rows[0].image_url) {
            const { deleteImage } = require('../services/supabaseStorage');
            await deleteImage(currentCat.rows[0].image_url);
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

// Get products in a category
router.get('/categories/:id/products', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const products = await pool.query(`
            SELECT p.id, p.name, p.price, p.image_url,
                   CASE WHEN pc.product_id IS NOT NULL THEN true ELSE false END as is_in_category
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            WHERE pc.category_id = $1
            ORDER BY p.name
        `, [id]);
        res.json(products.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update products in a category (Bulk assign)
router.post('/categories/:id/products', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { product_ids } = req.body; // Array of product IDs

        if (!Array.isArray(product_ids)) {
            return res.status(400).json({ error: 'product_ids must be an array' });
        }

        await client.query('BEGIN');

        // 1. Remove all existing links for this category in the join table
        // Note: We are NOT changing the primary 'category_id' column on the products table to avoid data loss/complexity
        await client.query('DELETE FROM product_categories WHERE category_id = $1', [id]);

        // 2. Insert new links
        if (product_ids.length > 0) {
            const values = product_ids.map(pid => `(${parseInt(pid)}, ${parseInt(id)})`).join(',');
            await client.query(`
                INSERT INTO product_categories (product_id, category_id)
                VALUES ${values}
                ON CONFLICT DO NOTHING
            `);
        }

        await client.query('COMMIT');
        res.json({ message: 'Category products updated successfully', count: product_ids.length });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating category products:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
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

// Get all products with new arrivals status (for management list)
router.get('/new-arrivals', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, 
                p.name, 
                p.price, 
                p.image_url, 
                CASE WHEN na.product_id IS NOT NULL THEN true ELSE false END as is_new_arrival, 
                p.category_id,
                COALESCE(
                    (
                        SELECT json_agg(category_id)
                        FROM product_categories
                        WHERE product_id = p.id
                    ),
                    '[]'::json
                ) as category_ids
            FROM products p
            LEFT JOIN new_arrivals na ON p.id = na.product_id
            ORDER BY p.name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update new arrivals (Bulk assign)
router.post('/new-arrivals', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { product_ids } = req.body;

        if (!Array.isArray(product_ids)) {
            return res.status(400).json({ error: 'product_ids must be an array' });
        }

        await client.query('BEGIN');

        // 1. Reset all products in the new_arrivals table
        await client.query('DELETE FROM new_arrivals');

        // 2. Set new arrivals for selected IDs by inserting into new_arrivals
        if (product_ids.length > 0) {
            const safeIds = product_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (safeIds.length > 0) {
                await client.query(`
                    INSERT INTO new_arrivals (product_id)
                    SELECT * FROM UNNEST($1::integer[])
                    ON CONFLICT DO NOTHING
                `, [safeIds]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'New arrivals updated successfully', count: product_ids.length });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in post new-arrivals:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});


// Get all products with best sellers status (for management list)
router.get('/best-sellers', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, 
                p.name, 
                p.price, 
                p.image_url, 
                CASE WHEN bs.product_id IS NOT NULL THEN true ELSE false END as is_best_seller, 
                p.category_id,
                COALESCE(
                    (
                        SELECT json_agg(category_id)
                        FROM product_categories
                        WHERE product_id = p.id
                    ),
                    '[]'::json
                ) as category_ids
            FROM products p
            LEFT JOIN best_sellers bs ON p.id = bs.product_id
            ORDER BY p.name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update best sellers (Bulk assign)
router.post('/best-sellers', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { product_ids } = req.body;

        if (!Array.isArray(product_ids)) {
            return res.status(400).json({ error: 'product_ids must be an array' });
        }

        await client.query('BEGIN');

        // 1. Reset all products in the best_sellers table
        await client.query('DELETE FROM best_sellers');

        // 2. Set best sellers for selected IDs by inserting into best_sellers
        if (product_ids.length > 0) {
            const safeIds = product_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (safeIds.length > 0) {
                await client.query(`
                    INSERT INTO best_sellers (product_id)
                    SELECT * FROM UNNEST($1::integer[])
                    ON CONFLICT DO NOTHING
                `, [safeIds]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Best sellers updated successfully', count: product_ids.length });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in post best-sellers:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ───────────────────────────────────────────────────────────────────────────
// BANNER MANAGEMENT
// ───────────────────────────────────────────────────────────────────────────

async function ensureBannersTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS banners (
                id          SERIAL PRIMARY KEY,
                title       TEXT,
                image_url   TEXT NOT NULL,
                link_type   TEXT NOT NULL DEFAULT 'product',
                link_value  TEXT,
                platform    TEXT NOT NULL DEFAULT 'web',
                section     TEXT NOT NULL DEFAULT 'top',
                sort_order  INTEGER DEFAULT 0,
                is_active   BOOLEAN DEFAULT TRUE,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        `);
    } catch (err) {
        console.error('Error ensuring banners table:', err.message);
    }
}

// GET all banners (admin)
router.get('/banners', adminAuth, async (req, res) => {
    try {
        await ensureBannersTable();
        const result = await pool.query(
            'SELECT * FROM banners ORDER BY sort_order ASC, id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create banner (with instant image upload response)
router.post('/banners', adminAuth, upload.single('image'), async (req, res) => {
    try {
        await ensureBannersTable();
        console.log('--- POST /banners ---');
        console.log('req.body:', req.body);
        console.log('req.file:', req.file);

        const { title, link_type, link_value, platform, section, sort_order, is_active } = req.body;

        let image_url = req.body.image_url || null;

        if (req.file) {
            image_url = `/uploads/profile-photos/${req.file.filename}`;
            console.log('Setting image_url to local path:', image_url);
        }

        if (!image_url) {
            console.log('Error: Banner image is required');
            return res.status(400).json({ error: 'Banner image is required' });
        }

        const result = await pool.query(
            `INSERT INTO banners (title, image_url, link_type, link_value, platform, section, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                title || null,
                image_url,
                link_type || 'product',
                link_value || null,
                platform || 'web',
                section || 'top',
                sort_order != null ? parseInt(sort_order) : 0,
                is_active !== undefined ? (is_active === 'false' || is_active === false ? false : true) : true
            ]
        );

        const newBanner = result.rows[0];
        res.json(newBanner);

        // Async background upload to Supabase storage without delaying response
        if (req.file) {
            uploadCategoryImage(req.file.path, title || 'banner')
                .then(uploaded => {
                    const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || uploaded?.path);
                    if (finalUrl) {
                        pool.query('UPDATE banners SET image_url = $1 WHERE id = $2', [finalUrl, newBanner.id]).catch(() => {});
                    }
                })
                .catch(err => console.warn('Background Supabase banner sync skipped:', err.message));
        }
    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update banner (with instant response)
router.put('/banners/:id', adminAuth, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, link_type, link_value, platform, section, sort_order, is_active, image_url: bodyImageUrl } = req.body;

        // Fetch existing banner
        const existing = await pool.query('SELECT * FROM banners WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        let image_url = bodyImageUrl || existing.rows[0].image_url;

        if (req.file) {
            image_url = `/uploads/profile-photos/${req.file.filename}`;
        }

        const result = await pool.query(
            `UPDATE banners
             SET title = $1, image_url = $2, link_type = $3, link_value = $4,
                 platform = $5, section = $6, sort_order = $7, is_active = $8
             WHERE id = $9
             RETURNING *`,
            [
                title !== undefined ? title : existing.rows[0].title,
                image_url,
                link_type || existing.rows[0].link_type,
                link_value !== undefined ? link_value : existing.rows[0].link_value,
                platform || existing.rows[0].platform,
                section || existing.rows[0].section,
                sort_order != null ? parseInt(sort_order) : existing.rows[0].sort_order,
                is_active !== undefined ? (is_active === 'false' || is_active === false ? false : true) : existing.rows[0].is_active,
                id
            ]
        );

        const updatedBanner = result.rows[0];
        res.json(updatedBanner);

        // Async background upload to Supabase storage without delaying response
        if (req.file) {
            uploadCategoryImage(req.file.path, title || 'banner')
                .then(uploaded => {
                    const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || uploaded?.path);
                    if (finalUrl) {
                        pool.query('UPDATE banners SET image_url = $1 WHERE id = $2', [finalUrl, updatedBanner.id]).catch(() => {});
                    }
                })
                .catch(err => console.warn('Background Supabase banner update sync skipped:', err.message));
        }
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE banner
router.delete('/banners/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await pool.query('SELECT image_url FROM banners WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        // Attempt to delete from storage (non-fatal if fails)
        try {
            const url = existing.rows[0].image_url;
            if (url && !url.includes('/images/banner/')) {
                await deleteImage(url);
            }
        } catch (storageErr) {
            console.warn('Could not delete banner image from storage:', storageErr.message);
        }

        await pool.query('DELETE FROM banners WHERE id = $1', [id]);
        res.json({ message: 'Banner deleted successfully' });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH update banner sort order (bulk reorder)
router.patch('/banners/reorder', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { items } = req.body; // [{ id, sort_order }, ...]
        if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

        await client.query('BEGIN');
        for (const item of items) {
            await client.query('UPDATE banners SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Banners reordered successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error reordering banners:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;