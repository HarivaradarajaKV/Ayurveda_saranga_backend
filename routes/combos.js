const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');

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
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching all combos:', error);
        res.status(500).json({ error: 'Failed to fetch combos' });
    }
});

// Public: list all combos (active, upcoming, expired) - frontend will filter as needed
router.get('/', async (req, res) => {
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
            return { ...c, subtotal, discount, total };
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
        res.json({ ...c, subtotal, discount, total });
    } catch (error) {
        console.error('Error fetching combo details:', error);
        res.status(500).json({ error: 'Failed to fetch combo details' });
    }
});

// Admin: create combo with items
router.post('/', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { title, description, image_url, image_url2, image_url3, image_url4, discount_type, discount_value, is_active, start_date, end_date, items } = req.body;
        
        console.log('[Combo Create] Received images:', {
            image_url: image_url || 'null',
            image_url2: image_url2 || 'null',
            image_url3: image_url3 || 'null',
            image_url4: image_url4 || 'null'
        });
        
        await client.query('BEGIN');
        const comboResult = await client.query(`
            INSERT INTO combo_offers (title, description, image_url, image_url2, image_url3, image_url4, discount_type, discount_value, is_active, start_date, end_date)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
        `, [
            title, 
            description || null, 
            image_url || null, 
            image_url2 || null,
            image_url3 || null,
            image_url4 || null,
            discount_type || 'percentage', 
            discount_value || 0, 
            is_active !== false, 
            start_date || null, 
            end_date || null
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
        res.status(500).json({ error: 'Failed to create combo offer' });
    } finally {
        client.release();
    }
});

// Admin: update combo and items
router.put('/:id', adminAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { title, description, image_url, image_url2, image_url3, image_url4, discount_type, discount_value, is_active, start_date, end_date, items } = req.body;
        await client.query('BEGIN');
        const updateResult = await client.query(`
            UPDATE combo_offers
            SET 
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                image_url = COALESCE($3, image_url),
                image_url2 = COALESCE($4, image_url2),
                image_url3 = COALESCE($5, image_url3),
                image_url4 = COALESCE($6, image_url4),
                discount_type = COALESCE($7, discount_type),
                discount_value = COALESCE($8, discount_value),
                is_active = COALESCE($9, is_active),
                start_date = $10,
                end_date = $11,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $12
            RETURNING *
        `, [title, description, image_url, image_url2, image_url3, image_url4, discount_type, discount_value, is_active, start_date || null, end_date || null, id]);

        if (updateResult.rows.length === 0) return res.status(404).json({ error: 'Combo not found' });

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
        res.status(500).json({ error: 'Failed to update combo offer' });
    } finally {
        client.release();
    }
});

// Admin: delete combo
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM combo_offers WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting combo:', error);
        res.status(500).json({ error: 'Failed to delete combo offer' });
    }
});

module.exports = router;


