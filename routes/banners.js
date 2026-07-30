const router = require('express').Router();
const pool = require('../db');

// Ensure banners table exists automatically
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

// Table schema initialized statically

// Public: GET /api/banners
// Query params: platform (web|mobile|both), section (top|bottom)
router.get('/', async (req, res) => {
    try {
        await ensureBannersTable();
        const { platform, section } = req.query;

        let conditions = ['is_active = TRUE AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())'];
        const params = [];

        if (platform) {
            params.push(platform);
            conditions.push(`(platform = $${params.length} OR platform = 'both')`);
        }

        if (section) {
            params.push(section);
            conditions.push(`section = $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
            `SELECT * FROM banners ${where} ORDER BY sort_order ASC, id ASC`,
            params
        );

        if (result.rows.length > 0) {
            const ids = result.rows.map(r => r.id);
            pool.query('UPDATE banners SET impressions = COALESCE(impressions, 0) + 1 WHERE id = ANY($1::int[])', [ids])
                .catch(e => console.error('Error incrementing impressions:', e.message));
        }

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
