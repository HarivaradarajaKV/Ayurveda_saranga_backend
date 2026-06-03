const pool = require('../db');

async function main() {
    try {
        const result = await pool.query('SELECT * FROM combo_offers');
        console.log('Combos in DB:');
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (err) {
        console.error('Error querying combos:', err);
    } finally {
        await pool.end();
    }
}

main();
