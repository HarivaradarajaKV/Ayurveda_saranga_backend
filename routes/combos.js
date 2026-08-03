const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadCategoryImage } = require('../services/supabaseStorage');
const { apiCache } = require('../middleware/apiCache');

// Admin: list all combos (active and inactive)
router.get('/all', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.id,
                c.title,
                c.description,
                c.image_url,
                c.image_url2,
                c.image_url3,
                c.image_url4,
                c.discount_type,
                c.discount_value,
                c.is_active,
                c.start_date,
                c.end_date,
                c.created_at,
                c.updated_at,
                c.price,
                c.original_price,
                COALESCE(json_agg(
                    DISTINCT jsonb_build_object(
                        'product_id', p.id,
                        'name', p.name,
                        'price', p.price,
                        'image_url', p.image_url,
                        'quantity', coi.quantity
                    )
                ) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
            FROM combo_offers c
            LEFT JOIN combo_offer_items coi ON c.id = coi.combo_id
            LEFT JOIN products p ON coi.product_id = p.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);

        const combos = result.rows.map(c => {
            const subtotal = c.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
            const discount = c.discount_type === 'percentage' 
                ? subtotal * (Number(c.discount_value) / 100)
                : Number(c.discount_value);
            const total = Math.max(subtotal - discount, 0);

            const originalPrice = c.original_price !== null && c.original_price !== undefined ? Number(c.original_price) : subtotal;
            const comboPrice = c.price !== null && c.price !== undefined ? Number(c.price) : total;

            return { 
                ...c, 
                subtotal: originalPrice, 
                discount, 
                total: comboPrice,
                original_price: originalPrice,
                combo_price: comboPrice,
                price: comboPrice
            };
        });

        res.json(combos);
    } catch (error) {
        console.error('Error fetching all combos:', error);
        res.status(500).json({ error: 'Failed to fetch combos' });
    }
});

// Public: list all combos (active, upcoming, expired) - frontend will filter as needed
router.get('/', apiCache(30000), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.id,
                c.title,
                c.description,
                c.image_url,
                c.image_url2,
                c.image_url3,
                c.image_url4,
                c.discount_type,
                c.discount_value,
                c.is_active,
                c.start_date,
                c.end_date,
                c.created_at,
                c.updated_at,
                c.price,
                c.original_price,
                COALESCE(json_agg(
                    DISTINCT jsonb_build_object(
                        'product_id', p.id,
                        'name', p.name,
                        'price', p.price,
                        'image_url', p.image_url,
                        'quantity', coi.quantity
                    )
                ) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
            FROM combo_offers c
            LEFT JOIN combo_offer_items coi ON c.id = coi.combo_id
            LEFT JOIN products p ON coi.product_id = p.id
            WHERE c.is_active = TRUE
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);

        const combos = result.rows.map(c => {
            const subtotal = c.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
            const discount = c.discount_type === 'percentage' 
                ? subtotal * (Number(c.discount_value) / 100)
                : Number(c.discount_value);
            const total = Math.max(subtotal - discount, 0);

            const originalPrice = c.original_price !== null && c.original_price !== undefined ? Number(c.original_price) : subtotal;
            const comboPrice = c.price !== null && c.price !== undefined ? Number(c.price) : total;

            return { 
                ...c, 
                subtotal: originalPrice, 
                discount, 
                total: comboPrice,
                original_price: originalPrice,
                combo_price: comboPrice,
                price: comboPrice
            };
        });

        res.json(combos);
    } catch (error) {
        console.error('Error fetching combos:', error);
        res.status(500).json({ error: 'Failed to fetch combo offers' });
    }
});

// Public: combo details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                c.*,
                COALESCE(json_agg(
                    DISTINCT jsonb_build_object(
                        'product_id', p.id,
                        'name', p.name,
                        'price', p.price,
                        'image_url', p.image_url,
                        'quantity', coi.quantity
                    )
                ) FILTER (WHERE p.id IS NOT NULL), '[]') AS items
            FROM combo_offers c
            LEFT JOIN combo_offer_items coi ON c.id = coi.combo_id
            LEFT JOIN products p ON coi.product_id = p.id
            WHERE c.id = $1
            GROUP BY c.id
        `, [id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Combo not found' });
        const c = result.rows[0];
        const subtotal = c.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0);
        const discount = c.discount_type === 'percentage' 
            ? subtotal * (Number(c.discount_value) / 100)
            : Number(c.discount_value);
        const total = Math.max(subtotal - discount, 0);

        const originalPrice = c.original_price !== null && c.original_price !== undefined ? Number(c.original_price) : subtotal;
        const comboPrice = c.price !== null && c.price !== undefined ? Number(c.price) : total;

        res.json({ 
            ...c, 
            subtotal: originalPrice, 
            discount, 
            total: comboPrice,
            original_price: originalPrice,
            combo_price: comboPrice,
            price: comboPrice
        });
    } catch (error) {
        console.error('Error fetching combo details:', error);
        res.status(500).json({ error: 'Failed to fetch combo details' });
    }
});

// Admin: create combo with items
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
    const client = await pool.connect();
    try {
        const title = req.body.title || req.body.name;
        const description = req.body.description || null;
        const price = (req.body.price || req.body.combo_price) ? Number(req.body.price || req.body.combo_price) : null;
        const original_price = req.body.original_price ? Number(req.body.original_price) : null;
        
        const discount_type = req.body.discount_type || 'percentage';
        const discount_value = req.body.discount_value !== undefined 
            ? Number(req.body.discount_value) 
            : (original_price && price ? original_price - price : 0);

        const is_active = req.body.is_active !== 'false' && req.body.is_active !== false;
        const start_date = req.body.start_date || null;
        const end_date = req.body.end_date || null;

        let items = req.body.items;
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                items = [];
            }
        }

        let image_url = req.body.image_url || null;
        if (req.file) {
            try {
                const uploadResult = await uploadCategoryImage(req.file.path, title || 'combo');
                image_url = uploadResult.url;
            } catch (uploadError) {
                console.warn('Supabase upload failed for combo image, using local upload:', uploadError.message);
                image_url = `/uploads/${req.file.filename}`;
            }
        }

        if (!title) {
            return res.status(400).json({ error: 'Combo title is required' });
        }

        await client.query('BEGIN');
        const comboResult = await client.query(`
            INSERT INTO combo_offers (title, description, image_url, discount_type, discount_value, is_active, start_date, end_date, price, original_price)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *
        `, [
            title, 
            description, 
            image_url, 
            discount_type, 
            discount_value, 
            is_active, 
            start_date, 
            end_date,
            price,
            original_price
        ]);
        const combo = comboResult.rows[0];

        if (Array.isArray(items) && items.length > 0) {
            const values = items.map((it, i) => `($1, $${i*2+2}, $${i*2+3})`).join(',');
            const params = [combo.id];
            items.forEach(it => { params.push(it.product_id, it.quantity || 1); });
            await client.query(`
                INSERT INTO combo_offer_items (combo_id, product_id, quantity)
                VALUES ${values}
            `, params);
        }

        await client.query('COMMIT');
        res.status(201).json(combo);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating combo:', error);
        res.status(500).json({ error: 'Failed to create combo offer', details: error.message });
    } finally {
        client.release();
    }
});

// Admin: update combo and items
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const title = req.body.title || req.body.name;
        const description = req.body.description;
        const price = (req.body.price || req.body.combo_price) ? Number(req.body.price || req.body.combo_price) : null;
        const original_price = req.body.original_price ? Number(req.body.original_price) : null;
        
        const discount_type = req.body.discount_type || 'percentage';
        const discount_value = req.body.discount_value !== undefined 
            ? Number(req.body.discount_value) 
            : (original_price && price ? original_price - price : 0);

        const is_active = req.body.is_active !== 'false' && req.body.is_active !== false;
        const start_date = req.body.start_date || null;
        const end_date = req.body.end_date || null;

        let items = req.body.items;
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch (e) {
                items = [];
            }
        }

        let image_url = req.body.image_url;
        if (req.file) {
            try {
                const uploadResult = await uploadCategoryImage(req.file.path, title || 'combo');
                image_url = uploadResult.url;
            } catch (uploadError) {
                console.warn('Supabase upload failed for combo image, using local upload:', uploadError.message);
                image_url = `/uploads/${req.file.filename}`;
            }
        }

        await client.query('BEGIN');
        const updateResult = await client.query(`
            UPDATE combo_offers
            SET 
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                image_url = COALESCE(NULLIF($3, ''), image_url),
                discount_type = COALESCE($4, discount_type),
                discount_value = COALESCE($5, discount_value),
                is_active = COALESCE($6, is_active),
                start_date = $7,
                end_date = $8,
                price = COALESCE($9, price),
                original_price = COALESCE($10, original_price),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *
        `, [title, description, image_url, discount_type, discount_value, is_active, start_date, end_date, price, original_price, id]);

        if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Combo not found' });
        }

        if (Array.isArray(items)) {
            await client.query('DELETE FROM combo_offer_items WHERE combo_id = $1', [id]);
            if (items.length > 0) {
                const values = items.map((it, i) => `($1, $${i*2+2}, $${i*2+3})`).join(',');
                const params = [id];
                items.forEach(it => { params.push(it.product_id, it.quantity || 1); });
                await client.query(`
                    INSERT INTO combo_offer_items (combo_id, product_id, quantity)
                    VALUES ${values}
                `, params);
            }
        }

        await client.query('COMMIT');
        res.json(updateResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating combo:', error);
        res.status(500).json({ error: 'Failed to update combo offer', details: error.message });
    } finally {
        client.release();
    }
});

// Admin: delete combo
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM combo_offer_items WHERE combo_id = $1', [id]);
        await pool.query('DELETE FROM combo_offers WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting combo:', error);
        res.status(500).json({ error: 'Failed to delete combo offer', details: error.message });
    }
});

module.exports = router;


