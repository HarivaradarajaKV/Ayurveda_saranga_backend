const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function createProductCategoriesTable() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', 'add_product_categories_table.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing migration script...');
        await pool.query(sql);

        console.log('Product categories table created and populated successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error creating product categories table:', error);
        process.exit(1);
    }
}

createProductCategoriesTable();