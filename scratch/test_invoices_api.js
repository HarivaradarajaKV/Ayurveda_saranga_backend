const pool = require('../db');

async function testBackend() {
    console.log('Testing Invoice Module Database Operations...');
    try {
        // Test 1: Insert Company Address
        console.log('\n--- Test 1: Inserting Test Company Address ---');
        const companyRes = await pool.query(`
            INSERT INTO company_addresses 
            (company_name, address_line1, city, state, pincode, gst_number, drug_license, phone, email, is_default)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, company_name, is_default
        `, ['Air Lifesciences Test', 'No.50, 7th Cross, Jayanagar', 'Bengaluru', 'Karnataka', '560011', '29ACWPI1750R1ZN', 'KA-B31-208-254483', '8050737798', 'airlifes643@gmail.com', true]);
        
        console.log('Inserted Company Address ID:', companyRes.rows[0].id);

        // Test 2: Insert Customer Address
        console.log('\n--- Test 2: Inserting Test Customer ---');
        const customerRes = await pool.query(`
            INSERT INTO customer_addresses 
            (shop_name, owner_name, address_line1, city, state, pincode, gst_number, drug_license, phone, email, contact_person)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, shop_name
        `, ['Chaitra Pharma Test', 'Chaitra Owner', 'No 05-2, GF, Anjanapura', 'Bengaluru', 'Karnataka', '560062', '29AKAAB0205Q1Z1', '21-KA-B32-167791', '9845347209', 'chaitra@pharma.com', 'Chaitra Contact']);
        
        console.log('Inserted Customer ID:', customerRes.rows[0].id);

        // Test 3: Search for products and verify columns
        console.log('\n--- Test 3: Querying products-search autocomplete columns ---');
        const searchRes = await pool.query(`
            SELECT 
                p.id, p.name, p.sku, p.hsn_code, p.unit
            FROM products p
            LIMIT 2
        `);
        console.log('Products found (columns validation):', searchRes.rows);

        // Cleanup test data to keep database clean
        console.log('\n--- Cleaning up test records ---');
        await pool.query('DELETE FROM company_addresses WHERE id = $1', [companyRes.rows[0].id]);
        await pool.query('DELETE FROM customer_addresses WHERE id = $1', [customerRes.rows[0].id]);
        console.log('Cleaned up test company and customer records.');
        
        console.log('\n✅ ALL BACKEND DATABASE QUERY TESTS PASSED SUCCESSFULY!');
    } catch (err) {
        console.error('❌ Test failed:', err.message);
    } finally {
        await pool.end();
    }
}

testBackend();
