const router = require('express').Router();
const pool = require('../db');
const shiprocketService = require('../services/shiprocket');
const { auth, adminAuth } = require('../middleware/auth');

// Create shipment for an order (Admin only)
router.post('/create-shipment/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const {
            pickupLocation = 'Primary', // Your warehouse/store name in Shiprocket
            length = 10,
            breadth = 10,
            height = 10,
            weight = 0.5
        } = req.body;

        // Get order details
        const orderResult = await pool.query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'name', p.name,
          'sku', p.id,
          'units', oi.quantity,
          'selling_price', oi.price_at_time,
          'discount', 0,
          'tax', oi.gst_amount,
          'hsn', 441122
        )) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.id = $1
      GROUP BY o.id
    `, [orderId]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        // Get user email
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]);
        const userEmail = userResult.rows[0]?.email || 'customer@example.com';

        // Split customer name into first and last name
        const nameParts = order.shipping_full_name.split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'Name';

        // Prepare Shiprocket order data
        const shiprocketOrderData = {

            order_id: order.id.toString(),
            order_date: new Date(order.created_at).toISOString().split('T')[0],
            pickup_location: pickupLocation,
            billing_customer_name: firstName,
            billing_last_name: lastName,
            billing_address: order.shipping_address_line1,
            billing_address_2: order.shipping_address_line2 || '',
            billing_city: order.shipping_city,
            billing_pincode: order.shipping_postal_code,
            billing_postcode: order.shipping_postal_code,
            billing_state: order.shipping_state,
            billing_country: order.shipping_country || 'India',
            billing_email: userEmail,
            billing_phone: order.shipping_phone_number,
            shipping_is_billing: true,
            order_items: order.items,
            payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
            sub_total: parseFloat(order.total_amount) - parseFloat(order.delivery_charge || 0),
            shipping_charges: parseFloat(order.delivery_charge || 0),
            total: parseFloat(order.total_amount),
            length: length,
            breadth: breadth,
            height: height,
            weight: weight
        };

        // Create order in Shiprocket
        let shiprocketResponse;
        try {
            shiprocketResponse = await shiprocketService.createOrder(shiprocketOrderData);
        } catch (apiError) {
            console.error('Shiprocket API Error:', apiError.response?.data || apiError.message);
            return res.status(400).json({
                success: false,
                error: 'Shiprocket API Error: ' + (apiError.response?.data?.message || apiError.message),
                details: apiError.response?.data || 'Failed to create order in Shiprocket'
            });
        }

        // Update order with Shiprocket details
        await pool.query(`
      UPDATE orders 
      SET shiprocket_order_id = $1,
          shiprocket_shipment_id = $2,
          shipment_status = 'created',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
            shiprocketResponse.order_id,
            shiprocketResponse.shipment_id,
            orderId
        ]);

        res.json({
            success: true,
            message: 'Shipment created successfully',
            data: shiprocketResponse
        });
    } catch (error) {
        console.error('Error creating shipment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create shipment',
            details: 'Please check if pickup location exists in Shiprocket dashboard'
        });
    }
});

// Assign courier and generate AWB
router.post('/assign-courier/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { courierId } = req.body; // Optional, if not provided, uses recommended

        // Get order with shipment ID
        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (!order.shiprocket_shipment_id) {
            return res.status(400).json({
                error: 'Shipment not created yet. Please create shipment first.'
            });
        }

        let selectedCourierId = courierId;

        // If no courier specified, get recommended courier
        if (!selectedCourierId) {
            const recommendations = await shiprocketService.getRecommendedCourier(
                order.shiprocket_shipment_id
            );

            if (recommendations.data?.available_courier_companies?.length > 0) {
                // Select the first recommended courier
                selectedCourierId = recommendations.data.available_courier_companies[0].courier_company_id;
            } else {
                return res.status(400).json({
                    error: 'No courier service available for this shipment'
                });
            }
        }

        // Generate AWB
        const awbResponse = await shiprocketService.generateAWB(
            order.shiprocket_shipment_id,
            selectedCourierId
        );

        // Update order with AWB and courier details
        await pool.query(`
      UPDATE orders 
      SET awb_number = $1,
          courier_id = $2,
          courier_name = $3,
          shipment_status = 'awb_generated',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [
            awbResponse.response?.data?.awb_code,
            selectedCourierId,
            awbResponse.response?.data?.courier_name,
            orderId
        ]);

        res.json({
            success: true,
            message: 'AWB generated successfully',
            data: awbResponse
        });
    } catch (error) {
        console.error('Error assigning courier:', error);
        res.status(500).json({
            error: error.message || 'Failed to assign courier'
        });
    }
});

// Request pickup
router.post('/request-pickup/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (!order.shiprocket_shipment_id) {
            return res.status(400).json({
                error: 'Shipment not created yet'
            });
        }

        // Request pickup
        const pickupResponse = await shiprocketService.requestPickup([
            order.shiprocket_shipment_id
        ]);

        // Update order
        await pool.query(`
      UPDATE orders 
      SET shipment_status = 'pickup_scheduled',
          pickup_scheduled_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [orderId]);

        res.json({
            success: true,
            message: 'Pickup scheduled successfully',
            data: pickupResponse
        });
    } catch (error) {
        console.error('Error requesting pickup:', error);
        res.status(500).json({
            error: error.message || 'Failed to request pickup'
        });
    }
});

// Track shipment
router.get('/track/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
            [orderId, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (!order.shiprocket_shipment_id && !order.awb_number) {
            return res.status(400).json({
                error: 'Tracking not available yet'
            });
        }

        let trackingData;

        if (order.awb_number) {
            trackingData = await shiprocketService.trackByAWB(order.awb_number);
        } else {
            trackingData = await shiprocketService.trackShipment(order.shiprocket_shipment_id);
        }

        res.json({
            success: true,
            data: trackingData
        });
    } catch (error) {
        console.error('Error tracking shipment:', error);
        res.status(500).json({
            error: error.message || 'Failed to track shipment'
        });
    }
});

// Check serviceability
router.post('/check-serviceability', async (req, res) => {
    try {
        const {
            pickupPincode,
            deliveryPincode,
            weight = 0.5,
            codAmount = 0
        } = req.body;

        const serviceability = await shiprocketService.checkServiceability(
            pickupPincode,
            deliveryPincode,
            weight,
            codAmount
        );

        res.json({
            success: true,
            data: serviceability
        });
    } catch (error) {
        console.error('Error checking serviceability:', error);
        res.status(500).json({
            error: error.message || 'Failed to check serviceability'
        });
    }
});

// Generate label
router.post('/generate-label/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1',
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (!order.shiprocket_shipment_id) {
            return res.status(400).json({ error: 'Shipment not created yet' });
        }

        const labelResponse = await shiprocketService.generateLabel([
            order.shiprocket_shipment_id
        ]);

        // Update order with label URL
        if (labelResponse.label_url) {
            await pool.query(`
        UPDATE orders 
        SET label_url = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [labelResponse.label_url, orderId]);
        }

        res.json({
            success: true,
            data: labelResponse
        });
    } catch (error) {
        console.error('Error generating label:', error);
        res.status(500).json({
            error: error.message || 'Failed to generate label'
        });
    }
});

// Webhook endpoint for Shiprocket updates
router.post('/webhook', async (req, res) => {
    try {
        const webhookData = req.body;

        console.log('Received Shiprocket webhook:', webhookData);

        // Update order based on shipment status
        if (webhookData.awb) {
            await pool.query(`
        UPDATE orders 
        SET shipment_status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE awb_number = $2
      `, [webhookData.current_status, webhookData.awb]);
        }

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
