const router = require('express').Router();
const pool = require('../db');
const { auth, adminAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

const uploadConfig = {
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit for higher quality images
    }
};

const upload = multer(uploadConfig);

// Create separate upload middlewares for different routes
const uploadArray = upload.array('images', 3);
const uploadFields = upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]);

// Get all products with filters
router.get('/', async (req, res) => {
    try {
        const { 
            category,
            search, 
            min_price, 
            max_price,
            product_types,
            skin_types,
            concerns,
            page = 1,
            limit = 10
        } = req.query;

        let query = `
            SELECT DISTINCT
                p.id,
                p.name,
                p.description,
                p.price,
                p.category,
                p.image_url,
                p.image_url2,
                p.image_url3,
                p.usage_instructions,
                p.size,
                p.benefits,
                p.ingredients,
                p.product_details,
                p.stock_quantity,
                p.created_at,
                p.offer_percentage,
                c.name as category_name,
                pc.name as parent_category_name,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories pc ON c.parent_id = pc.id
            LEFT JOIN reviews r ON p.id = r.product_id
            WHERE 1=1
        `;
        const queryParams = [];
        let paramCount = 1;

        // Add filters with proper type casting and error handling
        if (category) {
            query += ` AND (LOWER(c.name) = LOWER($${paramCount}) OR LOWER(pc.name) = LOWER($${paramCount}))`;
            queryParams.push(category);
            paramCount++;
        }

        if (search) {
            query += ` AND (
                LOWER(p.name) LIKE LOWER($${paramCount})
                OR LOWER(p.description) LIKE LOWER($${paramCount})
                OR LOWER(COALESCE(p.ingredients, '')) LIKE LOWER($${paramCount})
                OR LOWER(COALESCE(p.benefits, '')) LIKE LOWER($${paramCount})
                OR LOWER(COALESCE(p.product_details, '')) LIKE LOWER($${paramCount})
            )`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        if (min_price) {
            query += ` AND p.price >= $${paramCount}::numeric`;
            queryParams.push(min_price);
            paramCount++;
        }

        if (max_price) {
            query += ` AND p.price <= $${paramCount}::numeric`;
            queryParams.push(max_price);
            paramCount++;
        }

        if (product_types) {
            const types = product_types.split(',');
            query += ` AND LOWER(p.product_type) = ANY(ARRAY[${types.map((_, i) => `LOWER($${paramCount + i})`).join(', ')}]::text[])`;
            queryParams.push(...types);
            paramCount += types.length;
        }

        if (skin_types) {
            const types = skin_types.split(',');
            query += ` AND LOWER(p.skin_type) = ANY(ARRAY[${types.map((_, i) => `LOWER($${paramCount + i})`).join(', ')}]::text[])`;
            queryParams.push(...types);
            paramCount += types.length;
        }

        if (concerns) {
            const concernList = concerns.split(',');
            query += ` AND LOWER(p.concerns::text) && ARRAY[${concernList.map((_, i) => `LOWER($${paramCount + i})`).join(', ')}]::text[]`;
            queryParams.push(...concernList);
            paramCount += concernList.length;
        }

        // Add group by clause
        query += ` GROUP BY p.id, c.name, pc.name`;

        // Add sorting
        query += ` ORDER BY p.created_at DESC`;

        // Add pagination with type casting
        const offset = (parseInt(page.toString()) - 1) * parseInt(limit.toString());
        query += ` LIMIT $${paramCount}::integer OFFSET $${paramCount + 1}::integer`;
        queryParams.push(limit, offset);

        // Execute query with error handling
        console.log('Executing query:', { text: query, values: queryParams });
        
        const products = await pool.query(query, queryParams);
        
        // Process the results to ensure all required fields are present
        const processedProducts = products.rows.map(product => {
            const {
                id, name, description, price, category, image_url,
                image_url2, image_url3, usage_instructions, size,
                benefits, ingredients, product_details, stock_quantity,
                created_at, category_name, parent_category_name,
                average_rating, review_count, offer_percentage
            } = product;

            return {
                id,
                name,
                description,
                price,
                category,
                image_url,
                image_url2,
                image_url3,
                usage_instructions,
                size,
                benefits,
                ingredients,
                product_details,
                stock_quantity: stock_quantity || 0,
                created_at,
                category_name,
                parent_category_name,
                average_rating,
                review_count,
                offer_percentage: offer_percentage || 0
            };
        });

        res.json({
            success: true,
            products: processedProducts,
            total: processedProducts.length
        });
    } catch (error) {
        console.error('Error in products route:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch products',
            details: error.message 
        });
    }
});

// Get product by id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get product details with category information
        const product = await pool.query(`
            SELECT 
                p.*,
                c.name as category_name,
                pc.name as parent_category_name,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories pc ON c.parent_id = pc.id
            LEFT JOIN reviews r ON p.id = r.product_id
            WHERE p.id = $1
            GROUP BY p.id, c.name, pc.name
        `, [id]);
        
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Get product reviews
        const reviews = await pool.query(`
            SELECT 
                r.*,
                u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = $1
            ORDER BY r.created_at DESC
        `, [id]);
        
        // Get related products from same category
        const relatedProducts = await pool.query(`
            SELECT 
                p.*,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count
            FROM products p
            LEFT JOIN reviews r ON p.id = r.product_id
            WHERE p.category_id = $1 AND p.id != $2
            GROUP BY p.id
            LIMIT 5
        `, [product.rows[0].category_id, id]);
        
        const result = {
            ...product.rows[0],
            reviews: reviews.rows,
            related_products: relatedProducts.rows
        };
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add product (admin only)
router.post('/', adminAuth, uploadArray, async (req, res) => {
    try {
        console.log('Received form fields:', req.body);
        console.log('Received files:', req.files);

        const { 
            name, 
            description, 
            price, 
            category_id, 
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            offer_percentage
        } = req.body;

        // Basic validation
        if (!name || !price || !category_id) {
            return res.status(400).json({ 
                error: 'Name, price, and category are required',
                received: { name, price, category_id }
            });
        }

        // Convert and validate category_id
        let categoryIdInt;
        try {
            categoryIdInt = parseInt(category_id, 10);
            if (isNaN(categoryIdInt)) {
                throw new Error('Invalid category ID format');
            }
        } catch (error) {
            return res.status(400).json({ 
                error: 'Invalid category ID format',
                received: category_id
            });
        }

        // Get category details
        const categoryResult = await pool.query(
            'SELECT id, name FROM categories WHERE id = $1',
            [categoryIdInt]
        );
        
        if (categoryResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }

        const categoryName = categoryResult.rows[0].name;

        // Convert price, stock_quantity and offer_percentage to numbers
        const priceNum = parseFloat(price);
        const stockNum = parseInt(stock_quantity || '0', 10);
        const offerNum = parseInt(offer_percentage || '0', 10);

        if (isNaN(priceNum)) {
            return res.status(400).json({ 
                error: 'Invalid price format',
                received: price
            });
        }

        if (isNaN(stockNum)) {
            return res.status(400).json({ 
                error: 'Invalid stock quantity format',
                received: stock_quantity
            });
        }

        if (isNaN(offerNum) || offerNum < 0 || offerNum > 100) {
            return res.status(400).json({ 
                error: 'Invalid offer percentage. Must be between 0 and 100',
                received: offer_percentage
            });
        }

        // Handle image URLs from uploaded files
        const files = req.files || [];
        const image_url = files[0] ? `/uploads/${files[0].filename}` : null;
        const image_url2 = files[1] ? `/uploads/${files[1].filename}` : null;
        const image_url3 = files[2] ? `/uploads/${files[2].filename}` : null;

        const newProduct = await pool.query(
            `INSERT INTO products (
                name, description, price, category_id, category, stock_quantity,
                usage_instructions, size, benefits, ingredients, product_details,
                image_url, image_url2, image_url3, offer_percentage
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
            RETURNING *`,
            [
                name, 
                description || '', 
                priceNum, 
                categoryIdInt,
                categoryName, 
                stockNum,
                usage_instructions || null,
                size || null,
                benefits || null,
                ingredients || null,
                product_details || null,
                image_url,
                image_url2,
                image_url3,
                offerNum
            ]
        );
        
        res.status(201).json(newProduct.rows[0]);
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product (admin only)
router.put('/:id', adminAuth, uploadFields, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Updating product:', id);
        console.log('Request body:', req.body);
        console.log('Request files:', req.files);
        
        const { 
            name, 
            description, 
            price, 
            category_id,
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            offer_percentage,
            existing_image1,
            existing_image2,
            existing_image3,
            remove_image1,
            remove_image2,
            remove_image3,
            replace_image1,
            replace_image2,
            replace_image3
        } = req.body;
        
        // Get current images
        const currentImages = await pool.query(
            'SELECT image_url, image_url2, image_url3 FROM products WHERE id = $1',
            [id]
        );

        if (currentImages.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const current = currentImages.rows[0];

        // Handle image updates - prioritize new uploads over existing images
        let image_url = null;
        let image_url2 = null;
        let image_url3 = null;

        // Process new uploaded files first (these take priority)
        if (req.files) {
            if (req.files.image1 && req.files.image1[0]) {
                image_url = `/uploads/${req.files.image1[0].filename}`;
                console.log('Setting new image1:', image_url);
            }
            if (req.files.image2 && req.files.image2[0]) {
                image_url2 = `/uploads/${req.files.image2[0].filename}`;
                console.log('Setting new image2:', image_url2);
            }
            if (req.files.image3 && req.files.image3[0]) {
                image_url3 = `/uploads/${req.files.image3[0].filename}`;
                console.log('Setting new image3:', image_url3);
            }
        }

        // Handle image removals
        if (remove_image1 === 'true') {
            image_url = null;
            console.log('Removing image1');
        }
        if (remove_image2 === 'true') {
            image_url2 = null;
            console.log('Removing image2');
        }
        if (remove_image3 === 'true') {
            image_url3 = null;
            console.log('Removing image3');
        }

        // Only keep existing images if no new file was uploaded and not marked for removal
        if (!req.files?.image1 && remove_image1 !== 'true' && existing_image1) {
            image_url = existing_image1;
            console.log('Keeping existing image1:', image_url);
        }
        if (!req.files?.image2 && remove_image2 !== 'true' && existing_image2) {
            image_url2 = existing_image2;
            console.log('Keeping existing image2:', image_url2);
        }
        if (!req.files?.image3 && remove_image3 !== 'true' && existing_image3) {
            image_url3 = existing_image3;
            console.log('Keeping existing image3:', image_url3);
        }

        // Rest of the update logic remains the same
        let offerNum = 0;
        if (offer_percentage !== undefined) {
            offerNum = parseInt(offer_percentage);
            if (isNaN(offerNum) || offerNum < 0 || offerNum > 100) {
                return res.status(400).json({ 
                    error: 'Invalid offer percentage. Must be between 0 and 100',
                    received: offer_percentage
                });
            }
        }
        
        const updatedProduct = await pool.query(`
            UPDATE products 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                price = COALESCE($3, price),
                category_id = COALESCE($4, category_id),
                stock_quantity = COALESCE($5, stock_quantity),
                usage_instructions = COALESCE($6, usage_instructions),
                size = COALESCE($7, size),
                benefits = COALESCE($8, benefits),
                ingredients = COALESCE($9, ingredients),
                product_details = COALESCE($10, product_details),
                image_url = $11,
                image_url2 = $12,
                image_url3 = $13,
                offer_percentage = $14,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $15 
            RETURNING *
        `, [
            name, 
            description, 
            price, 
            category_id, 
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            image_url,
            image_url2,
            image_url3,
            offerNum,
            id
        ]);

        if (updatedProduct.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const result = updatedProduct.rows[0];
        console.log('Final updated product with images:', {
            id: result.id,
            name: result.name,
            image_url: result.image_url,
            image_url2: result.image_url2,
            image_url3: result.image_url3
        });

        res.json(result);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedProduct = await pool.query(
            'DELETE FROM products WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (deletedProduct.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a review for a product
router.post('/:id/reviews', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const user_id = req.user.id;

        // Check if product exists
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Check if user has already reviewed this product
        const existingReview = await pool.query(
            'SELECT * FROM reviews WHERE user_id = $1 AND product_id = $2',
            [user_id, id]
        );

        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'You have already reviewed this product' });
        }

        // Add the review with IST timestamp
        const newReview = await pool.query(
            "INSERT INTO reviews (user_id, product_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) RETURNING *",
            [user_id, id, rating, comment]
        );

        // Get user name for the response
        const user = await pool.query('SELECT name FROM users WHERE id = $1', [user_id]);
        
        const reviewWithUserName = {
            ...newReview.rows[0],
            user_name: user.rows[0].name
        };

        res.json(reviewWithUserName);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get reviews for a product
router.get('/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        
        const reviews = await pool.query(
            `SELECT r.*, u.name as user_name 
            FROM reviews r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.product_id = $1 
            ORDER BY r.created_at DESC`,
            [id]
        );
        
        res.json(reviews.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 