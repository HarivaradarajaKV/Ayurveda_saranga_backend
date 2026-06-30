-- SQL script to create tables for Invoice Management Module

-- 1. Company Addresses Table
CREATE TABLE IF NOT EXISTS company_addresses (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    gst_number VARCHAR(50) NOT NULL,
    drug_license VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 2. Customer Addresses Table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    shop_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    gst_number VARCHAR(50),
    drug_license VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    contact_person VARCHAR(255),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 3. Enhance Products Table with extra details if not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sku') THEN
        ALTER TABLE products ADD COLUMN sku VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='hsn_code') THEN
        ALTER TABLE products ADD COLUMN hsn_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='unit') THEN
        ALTER TABLE products ADD COLUMN unit VARCHAR(50) DEFAULT 'PCS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='mfr') THEN
        ALTER TABLE products ADD COLUMN mfr VARCHAR(100);
    END IF;
END $$;

-- 4. Product Batches Table (batches track stock, MRP, selling price, expiry)
CREATE TABLE IF NOT EXISTS product_batches (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    mrp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    UNIQUE(product_id, batch_number)
);

-- 5. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    company_address_id INTEGER NOT NULL REFERENCES company_addresses(id) ON DELETE RESTRICT,
    customer_address_id INTEGER NOT NULL REFERENCES customer_addresses(id) ON DELETE RESTRICT,
    invoice_date DATE NOT NULL,
    due_date DATE,
    transport VARCHAR(255),
    po_number VARCHAR(100),
    sales_person VARCHAR(255),
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cgst DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sgst DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    igst DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    round_off DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'finalized', 'cancelled'
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 6. Invoice Line Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    free_quantity INTEGER NOT NULL DEFAULT 0,
    rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_percentage DECIMAL(5,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    gst_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    taxable_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    expiry_date DATE,
    batch_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Stock Transactions Table
CREATE TABLE IF NOT EXISTS stock_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'sale', 'adjustment', 'return', 'purchase'
    quantity INTEGER NOT NULL, -- Negative for sales, Positive for additions
    balance_stock INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Trigger to enforce only one DEFAULT company address
CREATE OR REPLACE FUNCTION update_default_company_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE company_addresses
        SET is_default = false
        WHERE id != NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_default_company_address ON company_addresses;
CREATE TRIGGER trigger_update_default_company_address
    BEFORE INSERT OR UPDATE ON company_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_default_company_address();

-- 9. Auto-updates triggers for updated_at column
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_company_address_timestamp ON company_addresses;
CREATE TRIGGER trigger_update_company_address_timestamp
    BEFORE UPDATE ON company_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_customer_address_timestamp ON customer_addresses;
CREATE TRIGGER trigger_update_customer_address_timestamp
    BEFORE UPDATE ON customer_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_product_batches_timestamp ON product_batches;
CREATE TRIGGER trigger_update_product_batches_timestamp
    BEFORE UPDATE ON product_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trigger_update_invoices_timestamp ON invoices;
CREATE TRIGGER trigger_update_invoices_timestamp
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_addresses_deleted ON company_addresses(deleted_at);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_deleted ON customer_addresses(deleted_at);
CREATE INDEX IF NOT EXISTS idx_product_batches_product_batch ON product_batches(product_id, batch_number);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_batch ON stock_transactions(batch_id);
