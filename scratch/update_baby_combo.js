const pool = require('../db');

async function main() {
    try {
        const result = await pool.query(
            `UPDATE combo_offers 
             SET image_url = $1, image_url2 = $2, image_url3 = $3, image_url4 = $4
             WHERE id = 17 OR title = 'Baby Combo'
             RETURNING *`,
            ['/uploads/baby-combo-pack.jpg', null, null, null]
        );
        console.log('Update result:');
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (err) {
        console.error('Error updating Baby Combo:', err);
    } finally {
        await pool.end();
    }
}

main();
