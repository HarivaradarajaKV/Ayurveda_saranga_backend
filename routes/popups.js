const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');
const { deleteImage } = require('../services/supabaseStorage');

// Ensure popups and popup_leads tables exist automatically
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

            CREATE TABLE IF NOT EXISTS popup_leads (
                id SERIAL PRIMARY KEY,
                popup_id INTEGER REFERENCES popups(id) ON DELETE SET NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                name VARCHAR(255),
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                source VARCHAR(100) DEFAULT 'google_popup',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (err) {
        console.error('Error ensuring popups/leads table:', err.message);
    }
}

// Table schema initialized statically

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

        const finalImageUrl = (image_url !== undefined && image_url !== null && image_url !== '')
            ? image_url
            : existing.rows[0].image_url;

        if (existing.rows[0].image_url && finalImageUrl && existing.rows[0].image_url !== finalImageUrl) {
            try {
                await deleteImage(existing.rows[0].image_url);
            } catch (err) {}
        }

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
        if (existing.rows[0] && existing.rows[0].image_url) {
            try {
                await deleteImage(existing.rows[0].image_url);
            } catch (err) {}
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

// ─── LEADS TRACKING ROUTES ──────────────────────────────────────────────────

// Public/Auth: Store Captured Popup Lead
router.post('/leads', async (req, res) => {
    try {
        await ensurePopupsTable();
        const { popup_id, email, name, phone, user_id, source } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required to log lead' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const leadSource = source || 'google_popup';

        // Check if lead already captured for this popup and email
        const existing = await pool.query(
            'SELECT id FROM popup_leads WHERE LOWER(email) = $1 AND (popup_id = $2 OR (popup_id IS NULL AND $2 IS NULL))',
            [cleanEmail, popup_id || null]
        );

        if (existing.rows.length > 0) {
            // Update existing lead details if new name/phone provided
            const updated = await pool.query(
                `UPDATE popup_leads 
                 SET name = COALESCE($1, name),
                     phone = COALESCE($2, phone),
                     user_id = COALESCE($3, user_id),
                     created_at = CURRENT_TIMESTAMP
                 WHERE id = $4 RETURNING *`,
                [name || null, phone || null, user_id || null, existing.rows[0].id]
            );
            return res.json(updated.rows[0]);
        }

        const newLead = await pool.query(
            `INSERT INTO popup_leads (popup_id, user_id, name, email, phone, source)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [popup_id || null, user_id || null, name || null, cleanEmail, phone || null, leadSource]
        );

        res.status(201).json(newLead.rows[0]);
    } catch (error) {
        console.error('Error logging popup lead:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: GET /api/popups/leads - List all captured leads with popup info
router.get('/leads', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const result = await pool.query(`
            SELECT 
                l.id,
                l.popup_id,
                l.user_id,
                l.name,
                l.email,
                l.phone,
                l.source,
                l.created_at,
                p.title as popup_title,
                p.image_url as popup_image
            FROM popup_leads l
            LEFT JOIN popups p ON l.popup_id = p.id
            ORDER BY l.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching popup leads:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: DELETE /api/popups/leads/:id
router.delete('/leads/:id', adminAuth, async (req, res) => {
    try {
        await ensurePopupsTable();
        const { id } = req.params;
        await pool.query('DELETE FROM popup_leads WHERE id = $1', [id]);
        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        console.error('Error deleting lead:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
