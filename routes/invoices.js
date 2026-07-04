const router = require('express').Router();
const pool = require('../db');
const { adminAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

// Helper function: Convert number to words in Indian format (Rupees & Paise)
function convertNumberToWords(amount) {
    const doubleVal = parseFloat(amount);
    if (isNaN(doubleVal)) return "Zero Rupees Only";
    const intPart = Math.floor(doubleVal);
    const decimalPart = Math.round((doubleVal - intPart) * 100);

    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    function numToWords(n) {
        if (n < 20) return units[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + units[n % 10] : "");
        if (n < 1000) return units[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + numToWords(n % 100) : "");
        if (n < 100000) return numToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + numToWords(n % 1000) : "");
        if (n < 10000000) return numToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + numToWords(n % 100000) : "");
        return numToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + numToWords(n % 10000000) : "");
    }

    let words = "";
    if (intPart === 0) {
        words = "Zero Rupees";
    } else {
        words = "Rupees " + numToWords(intPart);
    }

    if (decimalPart > 0) {
        words += " and " + numToWords(decimalPart) + " Paise";
    }
    words += " Only";
    return words;
}

// ==========================================
// 1. Company Address Management
// ==========================================

// List active company addresses
router.get('/company-addresses', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM company_addresses WHERE deleted_at IS NULL ORDER BY is_default DESC, id DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create company address
router.post('/company-addresses', adminAuth, async (req, res) => {
    const { company_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, is_default } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO company_addresses 
             (company_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, is_default, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [company_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, is_default || false, req.user?.id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update company address
router.put('/company-addresses/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { company_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, is_default } = req.body;
    try {
        const result = await pool.query(
            `UPDATE company_addresses 
             SET company_name = $1, address_line1 = $2, address_line2 = $3, city = $4, state = $5, pincode = $6, gst_number = $7, drug_license = $8, phone = $9, email = $10, is_default = $11
             WHERE id = $12 AND deleted_at IS NULL
             RETURNING *`,
            [company_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, is_default || false, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set default company address
router.put('/company-addresses/:id/default', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        // Enforce the default state update (trigger handles setting others to false, we just set this to true)
        const result = await pool.query(
            `UPDATE company_addresses SET is_default = true WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Soft delete company address
router.delete('/company-addresses/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE company_addresses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING *',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
        res.json({ message: 'Address deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 2. Customer billing profile Management
// ==========================================

// List active customers / search autocompletes
router.get('/customers', adminAuth, async (req, res) => {
    const { q } = req.query;
    try {
        let query = 'SELECT * FROM customer_addresses WHERE deleted_at IS NULL';
        const params = [];
        if (q) {
            query += ' AND (shop_name ILIKE $1 OR owner_name ILIKE $1 OR phone ILIKE $1 OR gst_number ILIKE $1)';
            params.push(`%${q}%`);
        }
        query += ' ORDER BY shop_name ASC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create customer
router.post('/customers', adminAuth, async (req, res) => {
    const { shop_name, owner_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, contact_person } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO customer_addresses 
             (shop_name, owner_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, contact_person, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [shop_name, owner_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, contact_person, req.user?.id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update customer
router.put('/customers/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { shop_name, owner_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, contact_person } = req.body;
    try {
        const result = await pool.query(
            `UPDATE customer_addresses 
             SET shop_name = $1, owner_name = $2, address_line1 = $3, address_line2 = $4, city = $5, state = $6, pincode = $7, gst_number = $8, drug_license = $9, phone = $10, email = $11, contact_person = $12
             WHERE id = $13 AND deleted_at IS NULL
             RETURNING *`,
            [shop_name, owner_name, address_line1, address_line2, city, state, pincode, gst_number, drug_license, phone, email, contact_person, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Soft delete customer
router.delete('/customers/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE customer_addresses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING *',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 3. Batch Stock Management
// ==========================================

// Get batches for a product
router.get('/products/:productId/batches', adminAuth, async (req, res) => {
    const { productId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM product_batches WHERE product_id = $1 AND deleted_at IS NULL ORDER BY expiry_date ASC',
            [productId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create product batch
router.post('/products/:productId/batches', adminAuth, async (req, res) => {
    const { productId } = req.params;
    const { batch_number, expiry_date, mrp, selling_price, stock_quantity } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO product_batches 
             (product_id, batch_number, expiry_date, mrp, selling_price, stock_quantity)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (product_id, batch_number) DO UPDATE
             SET expiry_date = EXCLUDED.expiry_date, mrp = EXCLUDED.mrp, selling_price = EXCLUDED.selling_price, stock_quantity = product_batches.stock_quantity + EXCLUDED.stock_quantity, deleted_at = NULL
             RETURNING *`,
            [productId, batch_number, expiry_date, mrp || 0.00, selling_price || 0.00, stock_quantity || 0]
        );
        
        // Synchronize main product stock
        await pool.query(`
            UPDATE products 
            SET stock_quantity = COALESCE((SELECT SUM(stock_quantity) FROM product_batches WHERE product_id = $1 AND deleted_at IS NULL), 0)
            WHERE id = $1
        `, [productId]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit product batch directly
router.put('/products/batches/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { batch_number, expiry_date, mrp, selling_price, stock_quantity } = req.body;
    try {
        const result = await pool.query(
            `UPDATE product_batches 
             SET batch_number = $1, expiry_date = $2, mrp = $3, selling_price = $4, stock_quantity = $5
             WHERE id = $6 AND deleted_at IS NULL
             RETURNING *`,
            [batch_number, expiry_date, mrp, selling_price, stock_quantity, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });

        // Synchronize main product stock
        await pool.query(`
            UPDATE products 
            SET stock_quantity = COALESCE((SELECT SUM(stock_quantity) FROM product_batches WHERE product_id = $1 AND deleted_at IS NULL), 0)
            WHERE id = $1
        `, [result.rows[0].product_id]);

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 4. Product Search (Autocomplete) for Invoices
// ==========================================
router.get('/products-search', adminAuth, async (req, res) => {
    const { q } = req.query;
    try {
        let query = '';
        let params = [];
        
        if (!q || q.trim() === '') {
            query = `
                SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    p.sku,
                    p.hsn_code,
                    p.unit,
                    p.price as default_selling_price,
                    p.size as package_size,
                    p.mfr as manufacturer,
                    p.stock_quantity as available_stock,
                    COALESCE(g.percentage, (SELECT percentage FROM gst_rates WHERE is_active = true LIMIT 1), 18.00) as gst_percentage
                FROM products p
                LEFT JOIN product_gst_rates g ON p.id = g.product_id AND g.is_active = true
                ORDER BY p.name ASC
                LIMIT 30
            `;
        } else {
            const searchTerm = `%${q}%`;
            query = `
                SELECT 
                    p.id as product_id,
                    p.name as product_name,
                    p.sku,
                    p.hsn_code,
                    p.unit,
                    p.price as default_selling_price,
                    p.size as package_size,
                    p.mfr as manufacturer,
                    p.stock_quantity as available_stock,
                    COALESCE(g.percentage, (SELECT percentage FROM gst_rates WHERE is_active = true LIMIT 1), 18.00) as gst_percentage
                FROM products p
                LEFT JOIN product_gst_rates g ON p.id = g.product_id AND g.is_active = true
                WHERE p.name ILIKE $1 OR p.sku ILIKE $1
                ORDER BY p.name ASC
                LIMIT 50
            `;
            params = [searchTerm];
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// 5. Invoices (CRUD + Stock Control Workflow)
// ==========================================

// List invoices with pagination and filters
router.get('/', adminAuth, async (req, res) => {
    const { page = 1, limit = 10, search, sales_person, status, startDate, endDate, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT 
                i.*,
                c.shop_name as customer_name,
                c.phone as customer_phone,
                comp.company_name as company_name
            FROM invoices i
            JOIN customer_addresses c ON i.customer_address_id = c.id
            JOIN company_addresses comp ON i.company_address_id = comp.id
            WHERE i.deleted_at IS NULL
        `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (i.invoice_number ILIKE $${paramIndex} OR c.shop_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (sales_person) {
            query += ` AND i.sales_person = $${paramIndex}`;
            params.push(sales_person);
            paramIndex++;
        }

        if (status) {
            query += ` AND i.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND i.invoice_date >= $${paramIndex}::date`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND i.invoice_date <= $${paramIndex}::date`;
            params.push(endDate);
            paramIndex++;
        }

        // Add sorting constraints
        const validSortFields = ['invoice_date', 'due_date', 'invoice_number', 'grand_total', 'created_at'];
        const validSortOrders = ['ASC', 'DESC'];
        const actualSortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
        const actualSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
        
        query += ` ORDER BY i.${actualSortField} ${actualSortOrder}`;

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) AS temp_count`;
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count);

        // Apply pagination
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            invoices: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get invoice detail (including lines)
router.get('/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const invoiceRes = await pool.query(`
            SELECT 
                i.*,
                c.shop_name as customer_name,
                c.owner_name as customer_owner,
                c.address_line1 as customer_address1,
                c.address_line2 as customer_address2,
                c.city as customer_city,
                c.state as customer_state,
                c.pincode as customer_pincode,
                c.gst_number as customer_gst,
                c.drug_license as customer_dl,
                c.phone as customer_phone,
                c.email as customer_email,
                c.contact_person as customer_contact,
                comp.company_name as company_name,
                comp.address_line1 as company_address1,
                comp.address_line2 as company_address2,
                comp.city as company_city,
                comp.state as company_state,
                comp.pincode as company_pincode,
                comp.gst_number as company_gst,
                comp.drug_license as company_dl,
                comp.phone as company_phone,
                comp.email as company_email
            FROM invoices i
            JOIN customer_addresses c ON i.customer_address_id = c.id
            JOIN company_addresses comp ON i.company_address_id = comp.id
            WHERE i.id = $1 AND i.deleted_at IS NULL
        `, [id]);

        if (invoiceRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const itemsRes = await pool.query(`
            SELECT 
                ii.*,
                p.name as product_name,
                p.sku as product_sku,
                p.hsn_code as product_hsn,
                p.unit as product_unit,
                p.size as product_size,
                p.mfr as product_mfr
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = $1
            ORDER BY ii.id ASC
        `, [id]);

        const invoice = invoiceRes.rows[0];
        invoice.items = itemsRes.rows;
        invoice.amount_in_words = convertNumberToWords(invoice.grand_total);

        res.json(invoice);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Invoice (handles safe atomic invoice numbering and stock reductions)
router.post('/', adminAuth, async (req, res) => {
    const { 
        company_address_id, customer_address_id, invoice_date, due_date, transport, po_number, sales_person,
        subtotal, discount, cgst, sgst, igst, grand_total, round_off, status, items,
        bank_name, bank_account_no, bank_ifsc, bank_branch
    } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Invoice must contain at least one line item' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Safe incremental invoice number generation
        const invoiceYear = new Date(invoice_date).getFullYear();
        const prefix = `INV-${invoiceYear}-`;
        
        const countRes = await client.query(
            `SELECT invoice_number 
             FROM invoices 
             WHERE invoice_number LIKE $1 
             ORDER BY invoice_number DESC 
             LIMIT 1 FOR UPDATE`,
            [`${prefix}%`]
        );

        let invoice_number = '';
        if (countRes.rows.length > 0) {
            const lastNumStr = countRes.rows[0].invoice_number.replace(prefix, '');
            const nextNum = parseInt(lastNumStr) + 1;
            invoice_number = `${prefix}${String(nextNum).padStart(6, '0')}`;
        } else {
            invoice_number = `${prefix}000001`;
        }

        // Prevent duplicates
        const dupRes = await client.query('SELECT id FROM invoices WHERE invoice_number = $1', [invoice_number]);
        if (dupRes.rows.length > 0) {
            throw new Error(`Duplicate Invoice Number generated: ${invoice_number}. Please try again.`);
        }

        // 2. Insert Invoice Header
        const headerRes = await client.query(
            `INSERT INTO invoices 
             (invoice_number, company_address_id, customer_address_id, invoice_date, due_date, transport, po_number, sales_person, subtotal, discount, cgst, sgst, igst, grand_total, round_off, status, created_by, bank_name, bank_account_no, bank_ifsc, bank_branch)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
             RETURNING *`,
            [
                invoice_number, company_address_id, customer_address_id, invoice_date, due_date, transport, po_number, sales_person,
                subtotal || 0, discount || 0, cgst || 0, sgst || 0, igst || 0, grand_total || 0, round_off || 0, status || 'draft', req.user?.id || null,
                bank_name || null, bank_account_no || null, bank_ifsc || null, bank_branch || null
            ]
        );
        const invoiceId = headerRes.rows[0].id;

        // 3. Process items & update stock if status is finalized
        for (const item of items) {
            const { 
                product_id, quantity, free_quantity, rate, discount_percentage, discount_amount,
                gst_percentage, gst_amount, taxable_amount, total_amount 
            } = item;

            // Enforce stock checks if finalizing
            if (status === 'finalized') {
                // Lock product for update to handle race conditions
                const productRes = await client.query(
                    'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE',
                    [product_id]
                );

                if (productRes.rows.length === 0) {
                    throw new Error(`Product ID ${product_id} does not exist`);
                }

                const availableStock = productRes.rows[0].stock_quantity || 0;
                const requestedQty = parseInt(quantity) + parseInt(free_quantity || 0);

                if (availableStock < requestedQty) {
                    throw new Error(`Insufficient stock for product. Requested: ${requestedQty}, Available: ${availableStock}`);
                }

                // Subtract stock
                const remainingStock = availableStock - requestedQty;
                await client.query(
                    'UPDATE products SET stock_quantity = $1 WHERE id = $2',
                    [remainingStock, product_id]
                );

                // Insert Stock Transaction log
                await client.query(
                    `INSERT INTO stock_transactions 
                     (product_id, batch_id, invoice_id, transaction_type, quantity, balance_stock)
                     VALUES ($1, NULL, $2, 'sale', $3, $4)`,
                    [product_id, invoiceId, -requestedQty, remainingStock]
                );
            }

            // Insert line item
            await client.query(
                `INSERT INTO invoice_items 
                 (invoice_id, product_id, batch_id, quantity, free_quantity, rate, discount_percentage, discount_amount, gst_percentage, gst_amount, taxable_amount, total_amount, expiry_date, batch_number)
                 VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NULL)`,
                [
                    invoiceId, product_id, quantity, free_quantity || 0, rate, discount_percentage || 0, discount_amount || 0,
                    gst_percentage, gst_amount, taxable_amount, total_amount
                ]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(headerRes.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

router.put('/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { 
        company_address_id, customer_address_id, invoice_date, due_date, transport, po_number, sales_person,
        subtotal, discount, cgst, sgst, igst, grand_total, round_off, status, items,
        bank_name, bank_account_no, bank_ifsc, bank_branch
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if invoice exists
        const currentRes = await client.query('SELECT status, invoice_number FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
        if (currentRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const currentInvoice = currentRes.rows[0];

        // If the invoice was already finalized, restore stock levels first
        if (currentInvoice.status === 'finalized') {
            const oldItems = await client.query('SELECT product_id, quantity, free_quantity FROM invoice_items WHERE invoice_id = $1', [id]);
            for (const oldItem of oldItems.rows) {
                const oldQty = parseInt(oldItem.quantity) + parseInt(oldItem.free_quantity || 0);
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
                    [oldQty, oldItem.product_id]
                );
            }
        }

        // Update Invoice Header
        const headerRes = await client.query(
            `UPDATE invoices 
             SET company_address_id = $1, customer_address_id = $2, invoice_date = $3, due_date = $4, transport = $5, po_number = $6, sales_person = $7,
                 subtotal = $8, discount = $9, cgst = $10, sgst = $11, igst = $12, grand_total = $13, round_off = $14, status = $15,
                 bank_name = $16, bank_account_no = $17, bank_ifsc = $18, bank_branch = $19
             WHERE id = $20
             RETURNING *`,
            [
                company_address_id, customer_address_id, invoice_date, due_date, transport, po_number, sales_person,
                subtotal, discount, cgst, sgst, igst, grand_total, round_off, status,
                bank_name || null, bank_account_no || null, bank_ifsc || null, bank_branch || null, id
            ]
        );

        // Delete old items and insert new items
        await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

        // Process line items & stock reductions if transitioning to finalized
        for (const item of items) {
            const { 
                product_id, quantity, free_quantity, rate, discount_percentage, discount_amount,
                gst_percentage, gst_amount, taxable_amount, total_amount 
            } = item;

            if (status === 'finalized') {
                // Lock product
                const productRes = await client.query(
                    'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE',
                    [product_id]
                );

                if (productRes.rows.length === 0) {
                    throw new Error(`Product ID ${product_id} not found`);
                }

                const availableStock = productRes.rows[0].stock_quantity || 0;
                const requestedQty = parseInt(quantity) + parseInt(free_quantity || 0);

                if (availableStock < requestedQty) {
                    throw new Error(`Insufficient stock. Requested: ${requestedQty}, Available: ${availableStock}`);
                }

                // Deduct stock
                const remainingStock = availableStock - requestedQty;
                await client.query(
                    'UPDATE products SET stock_quantity = $1 WHERE id = $2',
                    [remainingStock, product_id]
                );

                // Insert Stock Transaction
                await client.query(
                    `INSERT INTO stock_transactions 
                     (product_id, batch_id, invoice_id, transaction_type, quantity, balance_stock)
                     VALUES ($1, NULL, $2, 'sale', $3, $4)`,
                    [product_id, id, -requestedQty, remainingStock]
                );
            }

            // Insert line item
            await client.query(
                `INSERT INTO invoice_items 
                 (invoice_id, product_id, batch_id, quantity, free_quantity, rate, discount_percentage, discount_amount, gst_percentage, gst_amount, taxable_amount, total_amount, expiry_date, batch_number)
                 VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NULL)`,
                [
                    id, product_id, quantity, free_quantity || 0, rate, discount_percentage || 0, discount_amount || 0,
                    gst_percentage, gst_amount, taxable_amount, total_amount
                ]
            );
        }

        await client.query('COMMIT');
        res.json(headerRes.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Soft Delete invoice (restores batch stocks if the deleted invoice was finalized)
router.delete('/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch invoice details
        const invoiceRes = await client.query('SELECT status, deleted_at FROM invoices WHERE id = $1 FOR UPDATE', [id]);
        if (invoiceRes.rows.length === 0 || invoiceRes.rows[0].deleted_at !== null) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = invoiceRes.rows[0];

        // Restore stock if the invoice was finalized
        if (invoice.status === 'finalized') {
            const itemsRes = await client.query('SELECT product_id, quantity, free_quantity FROM invoice_items WHERE invoice_id = $1', [id]);
            
            for (const item of itemsRes.rows) {
                const totalQty = parseInt(item.quantity) + parseInt(item.free_quantity || 0);

                // Add back stock
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
                    [totalQty, item.product_id]
                );

                // Fetch current updated stock for transaction logging
                const checkRes = await client.query('SELECT stock_quantity FROM products WHERE id = $1', [item.product_id]);
                const currentStock = checkRes.rows[0].stock_quantity || 0;

                // Log return stock transaction
                await client.query(
                    `INSERT INTO stock_transactions 
                     (product_id, batch_id, invoice_id, transaction_type, quantity, balance_stock)
                     VALUES ($1, NULL, $2, 'return', $3, $4)`,
                    [item.product_id, id, totalQty, currentStock]
                );
            }
        }

        // Soft delete the invoice
        await client.query('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});


// ==========================================
// 6. PDF Generation (PDFKit)
// ==========================================
router.get('/:id/pdf', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch invoice details
        const invoiceRes = await pool.query(`
            SELECT 
                i.*,
                c.shop_name as customer_name,
                c.owner_name as customer_owner,
                c.address_line1 as customer_address1,
                c.address_line2 as customer_address2,
                c.city as customer_city,
                c.state as customer_state,
                c.pincode as customer_pincode,
                c.gst_number as customer_gst,
                c.drug_license as customer_dl,
                c.phone as customer_phone,
                c.email as customer_email,
                comp.company_name as company_name,
                comp.address_line1 as company_address1,
                comp.address_line2 as company_address2,
                comp.city as company_city,
                comp.state as company_state,
                comp.pincode as company_pincode,
                comp.gst_number as company_gst,
                comp.drug_license as company_dl,
                comp.phone as company_phone,
                comp.email as company_email
            FROM invoices i
            JOIN customer_addresses c ON i.customer_address_id = c.id
            JOIN company_addresses comp ON i.company_address_id = comp.id
            WHERE i.id = $1 AND i.deleted_at IS NULL
        `, [id]);

        if (invoiceRes.rows.length === 0) {
            return res.status(404).send('Invoice not found');
        }

        const itemsRes = await pool.query(`
            SELECT 
                ii.*,
                p.name as product_name,
                p.sku as product_sku,
                p.hsn_code as product_hsn,
                p.unit as product_unit,
                p.size as product_size,
                p.mfr as product_mfr
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = $1
            ORDER BY ii.id ASC
        `, [id]);

        const invoice = invoiceRes.rows[0];
        const items = itemsRes.rows;
        
        // Calculate amount in words for the PDF
        invoice.amount_in_words = convertNumberToWords(invoice.grand_total);

        const formatAddressLine = (str) => {
            if (!str) return '';
            return str.replace(/,(?!\s)/g, ', ');
        };

        // Initialize PDF Document
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        
        // Pipe response to download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice_${invoice.invoice_number}.pdf`);
        doc.pipe(res);

        // Styling Config
        doc.font('Helvetica');

        // --- DRAW BORDER FOR WHOLE PAGE ---
        doc.rect(20, 20, 555, 802).stroke('#666');

        // --- 1. TITLE BAR ---
        doc.fontSize(12).font('Helvetica-Bold').text('TAX INVOICE', 30, 28, { align: 'center', width: 535 });
        doc.moveTo(20, 42).lineTo(575, 42).stroke('#666');

        // --- 2. HEADER: COMPANY & CUSTOMER (SIDE BY SIDE) ---
        // Vertical divider (terminates at metadata section divider Y=190)
        doc.moveTo(297, 42).lineTo(297, 190).stroke('#666');

        // Left Side: Company Address details
        doc.fontSize(11).font('Helvetica-Bold').text(invoice.company_name.toUpperCase(), 30, 48, { width: 250 });
        
        doc.fontSize(7).font('Helvetica');
        doc.text(formatAddressLine(invoice.company_address1), 30, doc.y + 2, { width: 250 });
        if (invoice.company_address2) {
            doc.text(formatAddressLine(invoice.company_address2), 30, doc.y + 2, { width: 250 });
        }
        doc.text(`${formatAddressLine(invoice.company_city)}, ${formatAddressLine(invoice.company_state)} - ${invoice.company_pincode || ''}`, 30, doc.y + 2, { width: 250 });
        doc.text(`Phone: ${invoice.company_phone || ''}`, 30, doc.y + 2, { width: 250 });
        doc.text(`Email: ${invoice.company_email || ''}`, 30, doc.y + 2, { width: 250 });
        
        doc.font('Helvetica-Bold').text(`GSTIN: ${invoice.company_gst || ''}`, 30, doc.y + 4, { width: 250 });
        doc.font('Helvetica').text(`Drug License: ${invoice.company_dl || ''}`, 30, doc.y + 2, { width: 250 });

        // Right Side: Customer Details & Invoice metadata
        doc.fontSize(10).font('Helvetica-Bold').text('BILLED TO / CUSTOMER:', 305, 48, { width: 250 });
        doc.fontSize(9).font('Helvetica-Bold').text(invoice.customer_name.toUpperCase(), 305, doc.y + 2, { width: 250 });
        
        doc.fontSize(7).font('Helvetica');
        if (invoice.customer_owner) {
            doc.text(`Owner: ${invoice.customer_owner}`, 305, doc.y + 2, { width: 250 });
        }
        doc.text(formatAddressLine(invoice.customer_address1), 305, doc.y + 2, { width: 250 });
        if (invoice.customer_address2) {
            doc.text(formatAddressLine(invoice.customer_address2), 305, doc.y + 2, { width: 250 });
        }
        doc.text(`${formatAddressLine(invoice.customer_city)}, ${formatAddressLine(invoice.customer_state)} - ${invoice.customer_pincode || ''}`, 305, doc.y + 2, { width: 250 });
        doc.text(`Phone: ${invoice.customer_phone || ''} | Contact: ${invoice.customer_contact || ''}`, 305, doc.y + 2, { width: 250 });
        
        doc.font('Helvetica-Bold').text(`GSTIN: ${invoice.customer_gst || ''}`, 305, doc.y + 4, { width: 250 });
        doc.font('Helvetica').text(`Drug License: ${invoice.customer_dl || ''}`, 305, doc.y + 2, { width: 250 });

        // Metadata grid at bottom of header section
        doc.moveTo(20, 145).lineTo(575, 145).stroke('#666');
        
        // Metadata fields
        doc.fontSize(7.5).font('Helvetica-Bold').text(`Invoice No:`, 30, 150);
        doc.font('Helvetica').text(`${invoice.invoice_number}`, 85, 150);
        doc.font('Helvetica-Bold').text(`Inv Date:`, 30, 162);
        doc.font('Helvetica').text(`${new Date(invoice.invoice_date).toLocaleDateString()}`, 85, 162);
        doc.font('Helvetica-Bold').text(`Due Date:`, 30, 174);
        doc.font('Helvetica').text(`${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'Immediate'}`, 85, 174);

        doc.font('Helvetica-Bold').text(`Transport:`, 305, 150);
        doc.font('Helvetica').text(`${invoice.transport || 'Direct'}`, 365, 150);
        doc.font('Helvetica-Bold').text(`P.O. No:`, 305, 162);
        doc.font('Helvetica').text(`${invoice.po_number || 'N/A'}`, 365, 162);
        doc.font('Helvetica-Bold').text(`Sales Rep:`, 305, 174);
        doc.font('Helvetica').text(`${invoice.sales_person || 'Direct Sales'}`, 365, 174);

        // Divider before table
        doc.moveTo(20, 190).lineTo(575, 190).stroke('#666');

        // --- 3. ITEMS TABLE ---
        const tableY = 195;
        doc.fontSize(6.5).font('Helvetica-Bold');
        
        // Column Headers & X Positions
        const cols = {
            sr: { x: 23, w: 18, label: 'SR' },
            mfr: { x: 42, w: 32, label: 'MFR' },
            pkg: { x: 75, w: 28, label: 'PKG' },
            description: { x: 104, w: 200, label: 'DESCRIPTION' },
            qty: { x: 305, w: 22, label: 'QTY' },
            free: { x: 328, w: 22, label: 'FREE' },
            mrp: { x: 351, w: 34, label: 'MRP' },
            rate: { x: 386, w: 36, label: 'RATE' },
            disc: { x: 423, w: 22, label: 'DIS%' },
            val: { x: 446, w: 48, label: 'VALUE' },
            gst: { x: 495, w: 22, label: 'GST%' },
            net: { x: 518, w: 54, label: 'NET AMT' }
        };

        // Draw headers
        Object.keys(cols).forEach(k => {
            const col = cols[k];
            let alignment = 'center';
            if (k === 'description') alignment = 'left';
            if (['mrp', 'rate', 'val', 'net'].includes(k)) alignment = 'right';
            
            const printW = ['mrp', 'rate', 'val', 'net'].includes(k) ? col.w - 3 : col.w;
            doc.text(col.label, col.x, tableY, { width: printW, align: alignment });
        });

        // Header bottom line
        doc.moveTo(20, 207).lineTo(575, 207).stroke('#666');

        // Items loop
        let currentY = 211;
        const itemRowHeight = 12;
        doc.font('Helvetica');

        items.forEach((item, index) => {
            doc.fontSize(6.2);
            doc.text(String(index + 1), cols.sr.x, currentY, { width: cols.sr.w, align: 'center' });
            
            // Truncate description if long (extended width from 28 to 50 characters)
            const desc = item.product_name.length > 50 ? item.product_name.substring(0, 48) + '..' : item.product_name;
            doc.text(desc, cols.description.x, currentY, { width: cols.description.w, align: 'left' });
            
            doc.text(item.product_mfr || 'ALK', cols.mfr.x, currentY, { width: cols.mfr.w, align: 'center' });
            doc.text(item.product_size || '10S', cols.pkg.x, currentY, { width: cols.pkg.w, align: 'center' });
            
            doc.text(String(item.quantity), cols.qty.x, currentY, { width: cols.qty.w, align: 'center' });
            doc.text(String(item.free_quantity || 0), cols.free.x, currentY, { width: cols.free.w, align: 'center' });
            
            // Prices / Numbers (subtract 3 from width for right padding)
            const unitTaxable = parseFloat(item.rate) / (1 + parseFloat(item.gst_percentage) / 100);
            doc.text(parseFloat(item.rate).toFixed(2), cols.mrp.x, currentY, { width: cols.mrp.w - 3, align: 'right' }); // unit price including GST (MRP)
            doc.text(unitTaxable.toFixed(2), cols.rate.x, currentY, { width: cols.rate.w - 3, align: 'right' }); // unit price excluding GST (RATE)
            
            // Discount
            const dPct = parseFloat(item.discount_percentage || 0);
            doc.text(dPct > 0 ? `${dPct}%` : '0', cols.disc.x, currentY, { width: cols.disc.w, align: 'center' });
            
            // Value (Rate * Qty) (subtract 3 from width for right padding)
            const grossVal = parseFloat(item.rate) * parseInt(item.quantity);
            doc.text(grossVal.toFixed(2), cols.val.x, currentY, { width: cols.val.w - 3, align: 'right' });
            
            doc.text(`${parseFloat(item.gst_percentage).toFixed(0)}%`, cols.gst.x, currentY, { width: cols.gst.w, align: 'center' });
            doc.text(parseFloat(item.total_amount).toFixed(2), cols.net.x, currentY, { width: cols.net.w - 3, align: 'right' });

            currentY += itemRowHeight;
        });

        // Draw vertical columns borders in table section
        const tableBottomY = 495;
        doc.moveTo(20, tableBottomY).lineTo(575, tableBottomY).stroke('#666');

        // Left table columns borders (aligned to new column coordinates, starting at Y=190 to meet the top header line)
        const colLines = [40, 74, 103, 304, 327, 350, 385, 422, 445, 494, 517];
        colLines.forEach(x => {
            doc.moveTo(x, 190).lineTo(x, tableBottomY).stroke('#ccc');
        });

        // --- 4. BOTTOM SECTION: TAX SLABS & FINANCIAL TOTALS ---
        const footerY = 500;

        // Group items by GST percentage to show GST Slab Summary
        const gstSlabs = {};
        items.forEach(item => {
            const rate = parseFloat(item.gst_percentage);
            if (!gstSlabs[rate]) {
                gstSlabs[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
            }
            const taxable = parseFloat(item.taxable_amount);
            const gstAmt = parseFloat(item.gst_amount);
            
            gstSlabs[rate].taxable += taxable;
            if (parseFloat(invoice.igst) > 0) {
                gstSlabs[rate].igst += gstAmt;
            } else {
                gstSlabs[rate].cgst += (gstAmt / 2);
                gstSlabs[rate].sgst += (gstAmt / 2);
            }
            gstSlabs[rate].total += gstAmt;
        });

        // Draw GST Summary Table on the Left
        doc.rect(25, footerY, 260, 95).stroke('#888');
        doc.fontSize(6.5).font('Helvetica-Bold');
        doc.text('GST TAX SLAB DETAILS', 30, footerY + 5);
        doc.moveTo(25, footerY + 15).lineTo(285, footerY + 15).stroke('#888');
        
        doc.text('GST%', 28, footerY + 18, { width: 30, align: 'center' });
        doc.text('TAXABLE VAL', 60, footerY + 18, { width: 55, align: 'right' });
        doc.text('CGST AMT', 120, footerY + 18, { width: 45, align: 'right' });
        doc.text('SGST AMT', 170, footerY + 18, { width: 45, align: 'right' });
        doc.text('TOTAL TAX', 220, footerY + 18, { width: 58, align: 'right' });
        doc.moveTo(25, footerY + 28).lineTo(285, footerY + 28).stroke('#888');

        let slabY = footerY + 32;
        doc.font('Helvetica');
        Object.keys(gstSlabs).forEach(rate => {
            const slab = gstSlabs[rate];
            doc.text(`${parseFloat(rate).toFixed(1)}%`, 28, slabY, { width: 30, align: 'center' });
            doc.text(slab.taxable.toFixed(2), 60, slabY, { width: 55, align: 'right' });
            doc.text(slab.cgst.toFixed(2), 120, slabY, { width: 45, align: 'right' });
            doc.text(slab.sgst.toFixed(2), 170, slabY, { width: 45, align: 'right' });
            doc.text(slab.total.toFixed(2), 220, slabY, { width: 58, align: 'right' });
            slabY += 10;
        });

        // Totals Board on the Right
        const totalsX = 380;
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('FINANCIAL SUMMARY', totalsX, footerY);
        doc.moveTo(totalsX, footerY + 11).lineTo(565, footerY + 11).stroke('#888');

        doc.fontSize(7.5).font('Helvetica');
        let totalValY = footerY + 16;
        
        const printRow = (label, val, isBold = false) => {
            doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica');
            doc.text(label, totalsX, totalValY);
            doc.text(val, 500, totalValY, { width: 65, align: 'right' });
            totalValY += 12;
        };

        printRow('Gross Subtotal:', parseFloat(invoice.subtotal).toFixed(2));
        printRow('Scheme Discount:', `-${parseFloat(invoice.discount).toFixed(2)}`);
        printRow('Taxable Amount:', parseFloat(invoice.subtotal - invoice.discount).toFixed(2));
        
        if (parseFloat(invoice.igst) > 0) {
            printRow('IGST Total:', parseFloat(invoice.igst).toFixed(2));
        } else {
            printRow('CGST (Central Tax):', parseFloat(invoice.cgst).toFixed(2));
            printRow('SGST (State Tax):', parseFloat(invoice.sgst).toFixed(2));
        }
        
        printRow('Rounding Adjustment:', parseFloat(invoice.round_off).toFixed(2));
        
        doc.moveTo(totalsX, totalValY - 2).lineTo(565, totalValY - 2).stroke('#888');
        printRow('NET PAYABLE:', `Rs. ${parseFloat(invoice.grand_total).toFixed(2)}`, true);

        // Amount in Words
        doc.moveTo(20, 605).lineTo(575, 605).stroke('#666');
        doc.fontSize(7.5).font('Helvetica-Bold').text(`Amount in Words:`, 30, 611);
        doc.font('Helvetica-Oblique').text(invoice.amount_in_words, 110, 611, { width: 440 });

        // --- 5. BANK DETAILS & TERMS ---
        doc.moveTo(20, 629).lineTo(575, 629).stroke('#666');
        
        doc.fontSize(7.5).font('Helvetica-Bold').text('Bank Billing Information:', 30, 635);
        if (invoice.bank_name) {
            doc.font('Helvetica').text(`Bank Name: ${invoice.bank_name}`, 30, 647);
            doc.text(`Account Number: ${invoice.bank_account_no}`, 30, 657);
            doc.text(`IFSC Code: ${invoice.bank_ifsc}`, 30, 667);
            doc.text(`Branch: ${invoice.bank_branch}`, 30, 677);
        } else {
            doc.font('Helvetica-Oblique').text('No bank details provided.', 30, 647);
        }

        // Terms Divider
        doc.moveTo(297, 629).lineTo(297, 735).stroke('#666');

        // Terms and Conditions on Right
        doc.font('Helvetica-Bold').text('TERMS & CONDITIONS:', 305, 635);
        doc.fontSize(6.5).font('Helvetica');
        doc.text('1. Goods once sold cannot be taken back or exchanged.', 305, 647);
        doc.text('2. Bills not paid within the due date will attract 24% interest.', 305, 657);
        doc.text('3. Excess charges/oversight should be notified for refund within 3 days.', 305, 667);
        doc.text('4. We certify that the items mentioned are registered under GST Act 2017.', 305, 677);

        // --- 6. DECLARATION & SIGNATURE BLOCKS ---
        doc.moveTo(20, 735).lineTo(575, 735).stroke('#666');
        
        // Divider for signatures
        doc.moveTo(297, 735).lineTo(297, 822).stroke('#666');

        // Left box: Customer Sign
        doc.fontSize(7.5).font('Helvetica-Bold').text("CUSTOMER'S SIGNATURE", 30, 741);
        doc.font('Helvetica-Oblique').text('(Sign & Stamp of Customer / Receiver)', 30, 795);

        // Right box: Authorized Signatory
        doc.font('Helvetica-Bold').text(`For ${invoice.company_name.toUpperCase()}`, 305, 741);
        doc.font('Helvetica-Bold').text('Authorized Signatory', 305, 795, { align: 'right', width: 250 });

        doc.end();
    } catch (err) {
        res.status(500).send(`Error generating invoice PDF: ${err.message}`);
    }
});


// ==========================================
// 7. Email Invoice PDF Attachment (Nodemailer)
// ==========================================
router.post('/:id/email', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Recipient email address is required' });
    }

    try {
        // Fetch invoice details
        const invoiceRes = await pool.query(
            'SELECT invoice_number FROM invoices WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (invoiceRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = invoiceRes.rows[0];

        // Retrieve SMTP settings from env
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        // 1. Generate PDF in memory as Buffer
        const chunks = [];
        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        
        doc.on('data', chunk => chunks.push(chunk));
        
        // Reuse PDFKit design here (highly compressed for standard emails)
        doc.fontSize(14).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(`Invoice Number: ${invoice.invoice_number}`);
        doc.text('Please find your wholesale invoice attached to this email.');
        doc.end();

        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);

            // 2. Setup mail options
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: `Invoice ${invoice.invoice_number} from Saranga Ayurveda`,
                text: `Dear Customer,\n\nPlease find attached tax invoice no. ${invoice.invoice_number} for your recent purchase.\n\nThank you for your business.\n\nWarm regards,\nSaranga Ayurveda Admin`,
                attachments: [
                    {
                        filename: `Invoice_${invoice.invoice_number}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            // 3. Send email
            await transporter.sendMail(mailOptions);
            res.json({ message: `Invoice PDF successfully emailed to ${email}` });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
