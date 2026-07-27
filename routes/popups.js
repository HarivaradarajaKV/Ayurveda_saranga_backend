const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');

// Ensure popups table exists automatically
async function ensurePopupsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS popups (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                image_url TEXT,
                button_text VARCHAR(100) DEFAULT 'Claim Yours Now',
                link_type VARCHAR(50) DEFAULT 'custom',
                link_value TEXT,
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (err) {
        console.error('Error ensuring popups table:', err.message);
    }
}

// Automatically check table on module load
ensurePopupsTable();

// Public: GET /api/popups/active
router.get('/active', async (req, res) => {
    try {
        await ensurePopupsTable();
        const result = await pool.query('SELECT * FROM popups WHERE is_active = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.json(null);
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching active popup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: GET /api/popups/all
router.get('/all', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const result = await pool.query('SELECT * FROM popups ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching all popups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: POST /api/popups
// Accepts JSON body: { title, description, button_text, link_type, link_value, is_active, image_url }
// image_url is a full Supabase public URL sent from the admin after client-side upload
router.post('/', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const { title, description, button_text, link_type, link_value, is_active, image_url } = req.body;

        console.log('[Popup POST] body:', JSON.stringify({ title, image_url, is_active }));

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const isActiveBool = is_active === 'true' || is_active === true;

        if (isActiveBool) {
            // Deactivate all other popups
            await pool.query('UPDATE popups SET is_active = false');
        }

        const result = await pool.query(
            `INSERT INTO popups (title, description, image_url, button_text, link_type, link_value, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                title,
                description || null,
                image_url || null,
                button_text || 'Claim Yours Now',
                link_type || 'custom',
                link_value || null,
                isActiveBool
            ]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error creating popup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: PUT /api/popups/:id
// Accepts JSON body — image_url is a full Supabase public URL
router.put('/:id', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const { id } = req.params;
        const { title, description, button_text, link_type, link_value, is_active, image_url } = req.body;

        console.log('[Popup PUT] id:', id, 'body:', JSON.stringify({ title, image_url, is_active }));

        // Fetch existing row
        const existing = await pool.query('SELECT * FROM popups WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Popup not found' });
        }

        const isActiveBool = is_active === 'true' || is_active === true;

        // Use incoming image_url if provided, else keep existing
        const finalImageUrl = (image_url !== undefined && image_url !== null && image_url !== '')
            ? image_url
            : existing.rows[0].image_url;

        if (isActiveBool) {
            await pool.query('UPDATE popups SET is_active = false WHERE id != $1', [id]);
        }

        const result = await pool.query(
            `UPDATE popups
             SET title = $1, description = $2, image_url = $3, button_text = $4,
                 link_type = $5, link_value = $6, is_active = $7, updated_at = CURRENT_TIMESTAMP
             WHERE id = $8 RETURNING *`,
            [
                title,
                description || null,
                finalImageUrl,
                button_text || 'Claim Yours Now',
                link_type || 'custom',
                link_value || null,
                isActiveBool,
                id
            ]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating popup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: DELETE /api/popups/:id
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const { id } = req.params;
        const existing = await pool.query('SELECT * FROM popups WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Popup not found' });
        }
        await pool.query('DELETE FROM popups WHERE id = $1', [id]);
        res.json({ message: 'Popup deleted successfully' });
    } catch (error) {
        console.error('Error deleting popup:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: PUT /api/popups/:id/toggle
router.put('/:id/toggle', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const { id } = req.params;
        const existing = await pool.query('SELECT * FROM popups WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Popup not found' });
        }

        const nextActive = !existing.rows[0].is_active;
        if (nextActive) {
            // Deactivate all others first
            await pool.query('UPDATE popups SET is_active = false');
        }

        const result = await pool.query(
            'UPDATE popups SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [nextActive, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error toggling popup status:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
