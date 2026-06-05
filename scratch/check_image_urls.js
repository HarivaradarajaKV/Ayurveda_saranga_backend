const pool = require('../db');

async function checkUrls() {
    try {
        const result = await pool.query('SELECT id, name, image_url, image_url2, image_url3 FROM products LIMIT 10');
        console.log('--- Product Image URLs in DB ---');
        result.rows.forEach(p => {
            console.log(`Product ID: ${p.id} | Name: ${p.name}`);
            console.log(` - image_url:  ${p.image_url}`);
            console.log(` - image_url2: ${p.image_url2}`);
            console.log(` - image_url3: ${p.image_url3}`);
            console.log('------------------------------');
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUrls();
