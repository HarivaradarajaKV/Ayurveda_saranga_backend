const router = require('express').Router();
const pool = require('../db');
const shiprocketService = require('../services/shiprocket');
const { auth, adminAuth } = require('../middleware/auth');

// Helpers for data sanitization and clean format allocation to prevent Shiprocket API errors
const cleanPhone = (phone) => {
    if (!phone) return '9876543210';
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.slice(2);
    }
    if (cleaned.length < 10) {
        return '9876543210';
    }
    return cleaned.slice(-10);
};

const cleanPincode = (pincode) => {
    if (!pincode) return '560001';
    let cleaned = pincode.toString().replace(/\D/g, '');
    if (cleaned.length !== 6) {
        return '560001';
    }
    return cleaned;
};

const cleanName = (fullName) => {
    const name = (fullName || 'Customer Name').trim();
    const parts = name.split(/\s+/);
    const firstName = parts[0] || 'Customer';
    const lastName = parts.slice(1).join(' ') || 'Name';
    return { firstName, lastName };
};

const cleanAddress = (address, defaultName = 'Address Line') => {
    let addr = (address || '').trim();
    if (!addr) return defaultName + ' Details';
    if (addr.length < 10) {
        addr = addr + ' - ' + defaultName + ' Info';
    }
    return addr;
};

const getShiprocketErrorMessage = (error, defaultMsg) => {
    if (error.response?.data) {
        let msg = error.response.data.message || '';
        if (error.response.data.errors) {
            const errors = error.response.data.errors;
            const details = [];
            for (const key in errors) {
                if (Array.isArray(errors[key])) {
                    details.push(`${key}: ${errors[key].join(', ')}`);
                } else if (typeof errors[key] === 'string') {
                    details.push(`${key}: ${errors[key]}`);
                }
            }
            if (details.length > 0) {
                msg += ' (' + details.join('; ') + ')';
            }
        }
        return msg || defaultMsg;
    }
    return error.message || defaultMsg;
};

// Create shipment for an order (Admin only)
router.post('/create-shipment/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const {
            pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'warehouse', // Your warehouse/store name in Shiprocket
            length = 10,
            breadth = 10,
            height = 10,
            weight = 0.5
        } = req.body;

        // Get order details
        const orderResult = await pool.query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'name', COALESCE(p.name, 'Ayurveda Product'),
          'product_id', COALESCE(oi.product_id, 0),
          'units', COALESCE(oi.quantity, 1),
          'selling_price', COALESCE(oi.price_at_time, 0),
          'discount', 0,
          'tax', COALESCE(oi.gst_amount, 0),
          'hsn', 441122
        )) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.id = $1 AND (o.is_temporary = false OR o.is_temporary IS NULL)
      GROUP BY o.id
    `, [orderId]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        // Get user email
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [order.user_id]);
        const userEmail = userResult.rows[0]?.email || 'customer@example.com';

        // Sanitize customer names
        const { firstName, lastName } = cleanName(order.shipping_full_name);

        // Sanitize phone, pincode, email, addresses
        const billingPhone = cleanPhone(order.shipping_phone_number);
        const billingPincode = cleanPincode(order.shipping_postal_code);
        const billingAddress1 = cleanAddress(order.shipping_address_line1, 'Address Line 1');
        const billingAddress2 = (order.shipping_address_line2 || '').trim();
        const billingCity = (order.shipping_city || 'Kolar').trim();
        const billingState = (order.shipping_state || 'Karnataka').trim();
        const billingCountry = (order.shipping_country || 'India').trim();
        const billingEmail = userEmail.includes('@') ? userEmail.trim() : 'customer@example.com';

        // Sanitize order items
        const rawItems = order.items || [];
        const sanitizedItems = [];
        for (const item of rawItems) {
            if (!item || (!item.name && !item.product_id)) continue;
            sanitizedItems.push({
                name: (item.name || 'Ayurveda Product').trim().slice(0, 50),
                sku: `prod-${item.product_id || Math.floor(Math.random() * 1000)}`,
                units: parseInt(item.units) || 1,
                selling_price: parseFloat(item.selling_price) || 0,
                discount: parseFloat(item.discount) || 0,
                tax: parseFloat(item.tax) || 0,
                hsn: parseInt(item.hsn) || 441122
            });
        }

        if (sanitizedItems.length === 0) {
            sanitizedItems.push({
                name: 'Ayurveda Product',
                sku: 'prod-default',
                units: 1,
                selling_price: parseFloat(order.total_amount) || 10,
                discount: 0,
                tax: 0,
                hsn: 441122
            });
        }

        // Prepare Shiprocket order data
        const shiprocketOrderData = {
            order_id: order.id.toString(),
            order_date: new Date(order.created_at).toISOString().split('T')[0],
            pickup_location: pickupLocation,
            billing_customer_name: firstName,
            billing_last_name: lastName,
            billing_address: billingAddress1,
            billing_address_2: billingAddress2,
            billing_city: billingCity,
            billing_pincode: billingPincode,
            billing_postcode: billingPincode,
            billing_state: billingState,
            billing_country: billingCountry,
            billing_email: billingEmail,
            billing_phone: billingPhone,
            shipping_is_billing: true,
            order_items: sanitizedItems,
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
            
            // Validate that we received a valid order creation response from Shiprocket
            if (!shiprocketResponse || !shiprocketResponse.order_id) {
                const errMsg = shiprocketResponse?.message || 'Invalid response from Shiprocket';
                return res.status(400).json({
                    success: false,
                    error: 'Shiprocket Validation Error: ' + errMsg,
                    details: shiprocketResponse
                });
            }
        } catch (apiError) {
            console.error('Shiprocket API Error:', apiError.response?.data || apiError.message);
            return res.status(400).json({
                success: false,
                error: getShiprocketErrorMessage(apiError, 'Failed to create order in Shiprocket'),
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
            'SELECT * FROM orders WHERE id = $1 AND (is_temporary = false OR is_temporary IS NULL)',
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
        res.status(400).json({
            error: getShiprocketErrorMessage(error, 'Failed to assign courier')
        });
    }
});

// Request pickup
router.post('/request-pickup/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND (is_temporary = false OR is_temporary IS NULL)',
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
        res.status(400).json({
            error: getShiprocketErrorMessage(error, 'Failed to request pickup')
        });
    }
});

// Track shipment
router.get('/track/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND (is_temporary = false OR is_temporary IS NULL)',
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
        res.status(400).json({
            error: getShiprocketErrorMessage(error, 'Failed to track shipment')
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
        res.status(400).json({
            error: getShiprocketErrorMessage(error, 'Failed to check serviceability')
        });
    }
});

// Generate label
router.post('/generate-label/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND (is_temporary = false OR is_temporary IS NULL)',
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
        res.status(400).json({
            error: getShiprocketErrorMessage(error, 'Failed to generate label')
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

// Reset/recreate shipment status for an order
router.post('/reset-shipment/:orderId', auth, adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        // Get order details to check if there is an existing Shiprocket order
        const orderResult = await pool.query(
            'SELECT shiprocket_order_id FROM orders WHERE id = $1 AND (is_temporary = false OR is_temporary IS NULL)',
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const { shiprocket_order_id } = orderResult.rows[0];
        if (shiprocket_order_id) {
            try {
                // Try to cancel order on Shiprocket
                await shiprocketService.cancelOrder([parseInt(shiprocket_order_id)]);
                console.log(`Cancelled Shiprocket order ${shiprocket_order_id}`);
            } catch (apiError) {
                // Log and ignore apiError since order might not exist on Shiprocket
                console.error('Failed to cancel order on Shiprocket, proceeding with local reset:', apiError.response?.data || apiError.message);
            }
        }

        // Reset local Shiprocket columns in orders table
        await pool.query(`
            UPDATE orders 
            SET shiprocket_order_id = NULL,
                shiprocket_shipment_id = NULL,
                shipment_status = NULL,
                awb_number = NULL,
                courier_id = NULL,
                courier_name = NULL,
                estimated_delivery_date = NULL,
                tracking_url = NULL,
                label_url = NULL,
                manifest_url = NULL,
                pickup_scheduled_date = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [orderId]);

        res.json({
            success: true,
            message: 'Shipment details reset successfully. You can now recreate the shipment.'
        });
    } catch (error) {
        console.error('Error resetting shipment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to reset shipment'
        });
    }
});

module.exports = router;

