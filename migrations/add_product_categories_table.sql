CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

-- Populate with existing data
INSERT INTO product_categories (product_id, category_id)
SELECT id, category_id FROM products
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;
