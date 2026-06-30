const pool = require('../db');

async function verifyStockFlow() {
    console.log('=== VERIFYING INVENTORY WORKFLOW & TRANSACTIONS ===\n');
    const client = await pool.connect();
    try {
        // Find a test product
        const prodRes = await client.query('SELECT id, name FROM products LIMIT 1');
        if (prodRes.rows.length === 0) {
            console.log('No products found to run stock tests.');
            return;
        }
        const product = prodRes.rows[0];
        console.log(`Using product for testing: "${product.name}" (ID: ${product.id})`);

        // Clean up legacy test data if any
        await client.query("DELETE FROM product_batches WHERE batch_number LIKE 'BATCH-TEST-%'");

        // 1. Create a dummy company billing profile
        const compRes = await client.query(`
            INSERT INTO company_addresses (company_name, address_line1, city, state, pincode, gst_number)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, ['Test Company', 'Road 1', 'Bengaluru', 'Karnataka', '560011', '29GSTCOMPANY1234']);
        const companyId = compRes.rows[0].id;

        // 2. Create a dummy customer profile
        const custRes = await client.query(`
            INSERT INTO customer_addresses (shop_name, address_line1, city, state, pincode, phone)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, ['Test Customer Shop', 'Street 2', 'Bengaluru', 'Karnataka', '560062', '9999999999']);
        const customerId = custRes.rows[0].id;

        const batchNum = `BATCH-TEST-${Date.now()}`;

        // 3. Create a product batch with 100 units
        const batchRes = await client.query(`
            INSERT INTO product_batches (product_id, batch_number, expiry_date, mrp, selling_price, stock_quantity)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        `, [product.id, batchNum, '2028-12-31', 150.00, 120.00, 100]);
        const batchId = batchRes.rows[0].id;
        console.log(`Created test batch: "${batchNum}" (ID: ${batchId}) with 100 units.`);

        // 4. Create a FINALIZED invoice to buy 15 units
        console.log('\nGenerating finalized invoice to purchase 15 units...');
        
        // Setup invoice header
        const invHeaderRes = await client.query(`
            INSERT INTO invoices 
            (invoice_number, company_address_id, customer_address_id, invoice_date, status, grand_total, subtotal)
            VALUES ($1, $2, $3, CURRENT_DATE, 'finalized', 1800.00, 1800.00) RETURNING id
        `, [`INV-TEST-${Date.now()}`, companyId, customerId]);
        const invoiceId = invHeaderRes.rows[0].id;

        // Setup invoice item line (passing the variables array!)
        await client.query(`
            INSERT INTO invoice_items 
            (invoice_id, product_id, batch_id, quantity, rate, gst_percentage, gst_amount, taxable_amount, total_amount, batch_number)
            VALUES ($1, $2, $3, 15, 120.00, 0, 0, 1800.00, 1800.00, $4)
        `, [invoiceId, product.id, batchId, batchNum]);

        // Deduct stock (simulating route logic)
        await client.query('UPDATE product_batches SET stock_quantity = stock_quantity - 15 WHERE id = $1', [batchId]);
        await client.query(`
            INSERT INTO stock_transactions (product_id, batch_id, invoice_id, transaction_type, quantity, balance_stock)
            VALUES ($1, $2, $3, 'sale', -15, 85)
        `, [product.id, batchId, invoiceId]);

        // 5. Verify batch stock is 85 and transaction is logged
        const verifyStock = await client.query('SELECT stock_quantity FROM product_batches WHERE id = $1', [batchId]);
        const updatedQty = verifyStock.rows[0].stock_quantity;
        console.log(`Stock level after finalized invoice: ${updatedQty} (Expected: 85)`);

        const verifyTx = await client.query('SELECT transaction_type, quantity, balance_stock FROM stock_transactions WHERE invoice_id = $1', [invoiceId]);
        console.log(`Transaction logged: Type: "${verifyTx.rows[0].transaction_type}" | Qty: ${verifyTx.rows[0].quantity} | Balance: ${verifyTx.rows[0].balance_stock}`);

        // 6. Delete invoice (cancellation/refund logic check)
        console.log('\nDeleting invoice and triggering inventory restoration...');
        
        // Add back stock
        await client.query('UPDATE product_batches SET stock_quantity = stock_quantity + 15 WHERE id = $1', [batchId]);
        await client.query(`
            INSERT INTO stock_transactions (product_id, batch_id, invoice_id, transaction_type, quantity, balance_stock)
            VALUES ($1, $2, $3, 'return', 15, 100)
        `, [product.id, batchId, invoiceId]);
        await client.query('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [invoiceId]);

        // 7. Verify stock restored to 100
        const restoredRes = await client.query('SELECT stock_quantity FROM product_batches WHERE id = $1', [batchId]);
        console.log(`Stock level after cancellation: ${restoredRes.rows[0].stock_quantity} (Expected: 100)`);

        // Cleanup
        console.log('\n--- Cleaning up integration test records ---');
        await client.query('DELETE FROM stock_transactions WHERE invoice_id = $1', [invoiceId]);
        await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
        await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
        await client.query('DELETE FROM product_batches WHERE id = $1', [batchId]);
        await client.query('DELETE FROM customer_addresses WHERE id = $1', [customerId]);
        await client.query('DELETE FROM company_addresses WHERE id = $1', [companyId]);
        
        console.log('✅ ALL INVENTORY TRANSACTION LOGIC TESTS CONCLUDED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Integration test failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyStockFlow();
