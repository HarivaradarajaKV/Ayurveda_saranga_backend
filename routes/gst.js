const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');

// Get all GST rates
router.get('/', adminAuth, async (req, res) => {
    try {
        const gstRates = await pool.query(`
            SELECT * FROM gst_rates
            ORDER BY created_at DESC
        `);
        res.json(gstRates.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active GST rate
router.get('/active', async (req, res) => {
    try {
        const gstRate = await pool.query(`
            SELECT * FROM gst_rates
            WHERE is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        `);
        
        if (gstRate.rows.length === 0) {
            return res.json({ id: null, percentage: 0, name: 'No GST', description: 'No active GST rate' });
        }
        
        res.json(gstRate.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get GST rate by ID
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const gstRate = await pool.query(`
            SELECT * FROM gst_rates WHERE id = $1
        `, [id]);
        
        if (gstRate.rows.length === 0) {
            return res.status(404).json({ error: 'GST rate not found' });
        }
        
        res.json(gstRate.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new GST rate
router.post('/', adminAuth, async (req, res) => {
    try {
        const { name, description, percentage, is_active } = req.body;
        
        if (!name || percentage === undefined || percentage === null) {
            return res.status(400).json({ error: 'Name and percentage are required' });
        }
        
        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
        }
        
        // If setting this as active, deactivate all other rates
        if (is_active) {
            await pool.query(`
                UPDATE gst_rates SET is_active = false WHERE is_active = true
            `);
        }
        
        const result = await pool.query(`
            INSERT INTO gst_rates (name, description, percentage, is_active)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [name, description || null, percentage, is_active !== undefined ? is_active : true]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update GST rate
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, percentage, is_active } = req.body;
        
        // Check if GST rate exists
        const existing = await pool.query(`
            SELECT * FROM gst_rates WHERE id = $1
        `, [id]);
        
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'GST rate not found' });
        }
        
        // If setting this as active, deactivate all other rates
        if (is_active && !existing.rows[0].is_active) {
            await pool.query(`
                UPDATE gst_rates SET is_active = false WHERE is_active = true AND id != $1
            `, [id]);
        }
        
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;
        
        if (name !== undefined) {
            updateFields.push(`name = $${paramCount}`);
            updateValues.push(name);
            paramCount++;
        }
        
        if (description !== undefined) {
            updateFields.push(`description = $${paramCount}`);
            updateValues.push(description);
            paramCount++;
        }
        
        if (percentage !== undefined) {
            if (percentage < 0 || percentage > 100) {
                return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
            }
            updateFields.push(`percentage = $${paramCount}`);
            updateValues.push(percentage);
            paramCount++;
        }
        
        if (is_active !== undefined) {
            updateFields.push(`is_active = $${paramCount}`);
            updateValues.push(is_active);
            paramCount++;
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updateValues.push(id);
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        
        const result = await pool.query(`
            UPDATE gst_rates
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `, updateValues);
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete GST rate
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if GST rate exists
        const existing = await pool.query(`
            SELECT * FROM gst_rates WHERE id = $1
        `, [id]);
        
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'GST rate not found' });
        }
        
        // Don't allow deletion if it's the only active rate
        if (existing.rows[0].is_active) {
            const activeCount = await pool.query(`
                SELECT COUNT(*) as count FROM gst_rates WHERE is_active = true
            `);
            
            if (activeCount.rows[0].count <= 1) {
                return res.status(400).json({ error: 'Cannot delete the only active GST rate. Please activate another rate first.' });
            }
        }
        
        await pool.query(`
            DELETE FROM gst_rates WHERE id = $1
        `, [id]);
        
        res.json({ message: 'GST rate deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ----- Product-level GST -----

// Get GST rate for a specific product (public for pricing calculations)
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await pool.query(
            `SELECT percentage, is_active 
             FROM product_gst_rates 
             WHERE product_id = $1 AND is_active = true 
             LIMIT 1`,
            [productId]
        );

        if (result.rows.length === 0) {
            return res.json({ product_id: Number(productId), percentage: 0, is_active: false });
        }

        res.json({ product_id: Number(productId), ...result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all product GST rates with product names (public, used for checkout calculations)
router.get('/products', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id as product_id, p.name as product_name, 
                   COALESCE(g.percentage, 0) as percentage,
                   COALESCE(g.is_active, false) as is_active
            FROM products p
            LEFT JOIN product_gst_rates g ON g.product_id = p.id
            ORDER BY p.name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set or update GST rate for a product (admin)
router.put('/product/:productId', adminAuth, async (req, res) => {
    try {
        const { productId } = req.params;
        const { percentage, is_active = true } = req.body;

        if (percentage === undefined || percentage === null) {
            return res.status(400).json({ error: 'percentage is required' });
        }
        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({ error: 'percentage must be between 0 and 100' });
        }

        const result = await pool.query(
            `INSERT INTO product_gst_rates (product_id, percentage, is_active)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id)
             DO UPDATE SET percentage = EXCLUDED.percentage,
                           is_active = EXCLUDED.is_active,
                           updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [productId, percentage, is_active]
        );

        res.json({ message: 'GST updated for product', gst: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

