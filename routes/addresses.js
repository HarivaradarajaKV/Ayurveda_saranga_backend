const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// Get all addresses for the current user
router.get('/', auth, async (req, res) => {
    try {
        const addresses = await pool.query(
            'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            [req.user.id]
        );
        res.json(addresses.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Add a new address
router.post('/', auth, async (req, res) => {
    try {
        // Extract all fields from request body
        let {
            full_name,
            phone_number,
            address_line1,
            address_line2,
            city,
            state,
            postal_code,
            country,
            address_type,
            is_default
        } = req.body;

        // Validate required fields
        if (!full_name || !phone_number || !address_line1 || !city || !state || !postal_code) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['full_name', 'phone_number', 'address_line1', 'city', 'state', 'postal_code']
            });
        }

        // Set default values if not provided
        country = country || 'India';
        address_type = address_type || 'Home';
        is_default = is_default || false;
        address_line2 = address_line2 || null;

        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // If this is the first address or is_default is true, update existing addresses
            if (is_default) {
                await client.query(
                    'UPDATE addresses SET is_default = false WHERE user_id = $1',
                    [req.user.id]
                );
            }

            // Check if this is the first address for the user
            const addressCount = await client.query(
                'SELECT COUNT(*) FROM addresses WHERE user_id = $1',
                [req.user.id]
            );

            // If this is the first address, make it default
            if (addressCount.rows[0].count === '0') {
                is_default = true;
            }

            // Insert the new address
            const newAddress = await client.query(
                `INSERT INTO addresses 
                (user_id, full_name, phone_number, address_line1, address_line2, city, state, 
                postal_code, country, address_type, is_default)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [req.user.id, full_name, phone_number, address_line1, address_line2, city, state,
                postal_code, country, address_type, is_default]
            );

            await client.query('COMMIT');
            res.json(newAddress.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error adding address:', err);
        res.status(500).json({ 
            error: 'Failed to add address',
            details: err.message 
        });
    }
});

// Update an address
router.put('/:id', auth, async (req, res) => {
    const {
        full_name,
        phone_number,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        address_type,
        is_default
    } = req.body;

    try {
        // Check if address belongs to user
        const address = await pool.query(
            'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (address.rows.length === 0) {
            return res.status(404).json({ msg: 'Address not found or unauthorized' });
        }

        const updatedAddress = await pool.query(
            `UPDATE addresses 
            SET full_name = COALESCE($1, full_name),
                phone_number = COALESCE($2, phone_number),
                address_line1 = COALESCE($3, address_line1),
                address_line2 = $4,
                city = COALESCE($5, city),
                state = COALESCE($6, state),
                postal_code = COALESCE($7, postal_code),
                country = COALESCE($8, country),
                address_type = COALESCE($9, address_type),
                is_default = COALESCE($10, is_default)
            WHERE id = $11 AND user_id = $12
            RETURNING *`,
            [full_name, phone_number, address_line1, address_line2, city, state, postal_code, 
             country, address_type, is_default, req.params.id, req.user.id]
        );

        res.json(updatedAddress.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Delete an address
router.delete('/:id', auth, async (req, res) => {
    try {
        const address = await pool.query(
            'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );

        if (address.rows.length === 0) {
            return res.status(404).json({ msg: 'Address not found or unauthorized' });
        }

        res.json({ msg: 'Address removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Set address as default
router.put('/:id/default', auth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify address belongs to user
        const addressCheck = await client.query(
            'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (addressCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }

        // Remove default flag from all addresses of the user
        await client.query(
            'UPDATE addresses SET is_default = false WHERE user_id = $1',
            [req.user.id]
        );

        // Set the selected address as default
        const result = await client.query(
            'UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );

        await client.query('COMMIT');
        res.json({ success: true, address: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error setting default address:', err);
        res.status(500).json({ error: 'Failed to set default address' });
    } finally {
        client.release();
    }
});

module.exports = router; 