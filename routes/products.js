const router = require('express').Router();
const pool = require('../db');
const { auth, adminAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { uploadProductImage, deleteImage, createSignedUploadUrl } = require('../services/supabaseStorage');

const os = require('os');

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Use system temp directory for Vercel compatibility (read-only filesystem)
        cb(null, os.tmpdir());
    },
    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept images, gifs, videos, and documents
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|webm|pdf|doc|docx|txt|xls|xlsx)$/i)) {
        return cb(new Error('Only image, gif, video, and document files are allowed!'), false);
    }
    cb(null, true);
};

const uploadConfig = {
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit to support 2400x2400 high-res images, gifs, and videos
    }
};

const upload = multer(uploadConfig);

// Create separate upload middlewares for different routes
const uploadArray = upload.array('images', 20); // Allow up to 20 files
const uploadFields = upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]);

// Get storage credentials (admin only)
router.get('/storage-config', adminAuth, async (req, res) => {
    try {
        res.json({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
            bucketName: 'product-images'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create secure signed upload URL (admin only)
router.post('/signed-upload-url', adminAuth, async (req, res) => {
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[Storage Config Warning] SUPABASE_SERVICE_ROLE_KEY is not defined in backend environment variables. Signed URL creation will fall back to anon key and fail due to RLS.');
            return res.status(500).json({ 
                error: 'SUPABASE_SERVICE_ROLE_KEY is missing in backend environment variables. Please add it to your Vercel Dashboard settings to enable secure direct uploads.' 
            });
        }

        const { fileName } = req.body;
        if (!fileName) {
            return res.status(400).json({ error: 'fileName is required' });
        }

        const result = await createSignedUploadUrl(fileName);
        res.json(result);
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: error.message });
    }
});

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
            new_arrivals,
            page = 1,
            limit = 10
        } = req.query;

        let query = `
            SELECT
                p.id,
                p.name,
                p.description,
                p.price,
                p.category,
                p.image_url,
                p.image_url2,
                p.image_url3,
                p.image_url4,
                p.usage_instructions,
                p.size,
                p.benefits,
                p.ingredients,
                p.product_details,
                p.stock_quantity,
                p.created_at,
                p.offer_percentage,
                p.is_new_arrival,
                c.name as category_name,
                pc.name as parent_category_name,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(DISTINCT r.id) as review_count,
                (
                    SELECT COALESCE(json_agg(json_build_object('id', c_sub.id, 'name', c_sub.name)), '[]')
                    FROM product_categories pc_sub
                    JOIN categories c_sub ON pc_sub.category_id = c_sub.id
                    WHERE pc_sub.product_id = p.id
                ) as categories
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
            // Filter by category name in product_categories or primary category
            query += ` AND (
                LOWER(c.name) = LOWER($${paramCount}) 
                OR LOWER(pc.name) = LOWER($${paramCount})
                OR EXISTS (
                    SELECT 1 FROM product_categories pc_join 
                    JOIN categories c_join ON pc_join.category_id = c_join.id 
                    WHERE pc_join.product_id = p.id 
                    AND LOWER(c_join.name) = LOWER($${paramCount})
                )
            )`;
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

        if (new_arrivals === 'true') {
            query += ` AND p.is_new_arrival = true`;
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
                image_url2, image_url3, image_url4, usage_instructions, size,
                benefits, ingredients, product_details, stock_quantity,
                created_at, category_name, parent_category_name,
                average_rating, review_count, offer_percentage, is_new_arrival, categories
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
                image_url4,
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
                offer_percentage: offer_percentage || 0,
                is_new_arrival: is_new_arrival || false,
                categories: categories || []
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

        // Get all categories for this product
        const categoriesResult = await pool.query(`
            SELECT c.id, c.name 
            FROM product_categories pc
            JOIN categories c ON pc.category_id = c.id
            WHERE pc.product_id = $1
        `, [id]);

        const result = {
            ...product.rows[0],
            categories: categoriesResult.rows,
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
            category_ids, // New field for multiple categories
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            offer_percentage
        } = req.body;

        // Basic validation
        if (!name || !price || (!category_id && !category_ids)) {
            return res.status(400).json({
                error: 'Name, price, and category are required',
                received: { name, price, category_id, category_ids }
            });
        }

        // Convert and validate category_id
        // Parse category_ids
        let categoryIdsArray = [];
        if (category_ids) {
            try {
                const parsed = JSON.parse(category_ids);
                categoryIdsArray = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                // If it's not JSON, maybe it's a single ID or array from form
                categoryIdsArray = Array.isArray(category_ids) ? category_ids : [category_ids];
            }
        }

        // Convert and validate category_id (Primary Category)
        let categoryIdInt;

        // If category_id is not explicitly provided but we have category_ids, use the first one
        if (!category_id && categoryIdsArray.length > 0) {
            categoryIdInt = parseInt(categoryIdsArray[0], 10);
        } else {
            try {
                categoryIdInt = parseInt(category_id, 10);
            } catch (error) {
                // Should not happen if validation passed
            }
        }

        if (isNaN(categoryIdInt)) {
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


        // Handle pre-uploaded/existing media list (if direct-uploaded on client)
        let mediaList = [];
        if (req.body.existing_media) {
            try {
                mediaList = typeof req.body.existing_media === 'string' 
                    ? JSON.parse(req.body.existing_media) 
                    : req.body.existing_media;
                if (!Array.isArray(mediaList)) mediaList = [];
            } catch (err) {
                console.error('Error parsing existing_media:', err);
                mediaList = [];
            }
        }

        // Handle media uploads from files (images, gifs, videos)
        const files = req.files || [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const result = await uploadProductImage(file.path, 'temp', i + 1);
                
                const ext = path.extname(file.originalname).toLowerCase();
                let fileType = 'image';
                if (ext === '.gif') {
                    fileType = 'gif';
                } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
                    fileType = 'video';
                } else if (['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'].includes(ext)) {
                    fileType = 'document';
                }
                
                mediaList.push({
                    url: result.url,
                    type: fileType
                });
                console.log(`Media ${mediaList.length} (${fileType}) uploaded to Supabase:`, result.url);
            }
        } catch (uploadError) {
            console.error('Error uploading media to Supabase:', uploadError);
            return res.status(500).json({
                error: 'Failed to upload media to storage',
                details: uploadError.message
            });
        }

        const image_url = mediaList[0]?.url || null;
        const image_url2 = mediaList[1]?.url || null;
        const image_url3 = mediaList[2]?.url || null;
        const image_url4 = mediaList[3]?.url || null;

        const newProduct = await pool.query(
            `INSERT INTO products (
                name, description, price, category_id, category, stock_quantity,
                usage_instructions, size, benefits, ingredients, product_details,
                image_url, image_url2, image_url3, image_url4, offer_percentage, media
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
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
                image_url4,
                offerNum,
                JSON.stringify(mediaList)
            ]
        );


        const newProductResult = newProduct.rows[0];

        // Insert into product_categories
        if (categoryIdsArray.length > 0) {
            const categoryValues = categoryIdsArray
                .filter(id => !isNaN(parseInt(id)))
                .map(id => `(${newProductResult.id}, ${parseInt(id)})`)
                .join(',');

            if (categoryValues) {
                await pool.query(`
                    INSERT INTO product_categories (product_id, category_id)
                    VALUES ${categoryValues}
                    ON CONFLICT DO NOTHING
                `);
            }
        } else {
            // Insert primary category at minimum
            await pool.query(`
                INSERT INTO product_categories (product_id, category_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [newProductResult.id, categoryIdInt]);
        }

        // Fetch the complete product with categories to return
        const fullProduct = await pool.query(`
            SELECT 
                p.*,
                c.name as category_name,
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', cat.id, 'name', cat.name)) 
                    FILTER (WHERE cat.id IS NOT NULL), 
                    '[]'
                ) as categories
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_categories pc_link ON p.id = pc_link.product_id
            LEFT JOIN categories cat ON pc_link.category_id = cat.id
            WHERE p.id = $1
            GROUP BY p.id, c.name
        `, [newProductResult.id]);

        res.status(201).json(fullProduct.rows[0]);
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product (admin only)
router.put('/:id', adminAuth, uploadArray, async (req, res) => {
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
            category_ids, // New field
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            offer_percentage,
            existing_media
        } = req.body;

        // Sanitize category_id - it might come as an array or stringified array
        let categoryIdInt = null;
        if (category_id) {
            let rawVal = category_id;
            // If strictly an array, take first element
            if (Array.isArray(rawVal)) {
                rawVal = rawVal[0];
            }
            // If it's a string, it might be "37", "[37]", "{"37","37"}", etc.
            if (typeof rawVal === 'string') {
                rawVal = rawVal.trim();
                // Handle JSON string "[37]"
                if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                    try {
                        const parsed = JSON.parse(rawVal);
                        if (Array.isArray(parsed) && parsed.length > 0) rawVal = parsed[0];
                    } catch (e) { }
                }
                // Handle Postgres array string "{37,37}"
                else if (rawVal.startsWith('{') && rawVal.endsWith('}')) {
                    const parts = rawVal.slice(1, -1).split(',');
                    if (parts.length > 0) rawVal = parts[0].replace(/^"|"$/g, '');
                }
            }

            // Parse to int
            const parsedInt = parseInt(rawVal, 10);
            if (!isNaN(parsedInt)) {
                categoryIdInt = parsedInt;
            }
        }

        // Get current product details
        const currentProduct = await pool.query(
            'SELECT image_url, image_url2, image_url3, image_url4, media FROM products WHERE id = $1',
            [id]
        );

        if (currentProduct.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const current = currentProduct.rows[0];

        // 1. Determine existing media list
        let finalMedia = [];
        if (existing_media) {
            try {
                finalMedia = typeof existing_media === 'string' ? JSON.parse(existing_media) : existing_media;
                if (!Array.isArray(finalMedia)) finalMedia = [];
            } catch (err) {
                console.error('Error parsing existing_media:', err);
                finalMedia = [];
            }
        } else {
            // Fallback: Retain database list if no existing_media is specified
            finalMedia = Array.isArray(current.media) ? current.media : [];
        }

        // Identify which old media items were removed so we can delete them from Supabase if needed
        // Exclude temporary placeholders starting with 'new_file_' when calculating kept URLs
        const currentMediaList = Array.isArray(current.media) ? current.media : [];
        const keptUrls = new Set(
            finalMedia
                .filter(m => m && typeof m === 'object' && m.url)
                .map(m => m.url)
                .filter(url => typeof url === 'string' && !url.startsWith('new_file_'))
        );
        for (const item of currentMediaList) {
            if (item && typeof item === 'object' && item.url && !keptUrls.has(item.url)) {
                console.log('Deleting removed media from Supabase:', item.url);
                await deleteImage(item.url);
            }
        }

        // 2. Upload new media files
        const files = req.files || [];
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const result = await uploadProductImage(file.path, id, i + 1);
                
                const ext = path.extname(file.originalname).toLowerCase();
                let fileType = 'image';
                if (ext === '.gif') {
                    fileType = 'gif';
                } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
                    fileType = 'video';
                } else if (['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'].includes(ext)) {
                    fileType = 'document';
                }
                
                // Replace the temporary placeholder in the stiched list with the actual Supabase URL
                const placeholder = `new_file_${i}`;
                const idx = finalMedia.findIndex(m => m && typeof m === 'object' && m.url === placeholder);
                if (idx !== -1) {
                    finalMedia[idx].url = result.url;
                    finalMedia[idx].type = fileType;
                    console.log(`Placed new file at stitched position ${idx + 1} using placeholder: ${placeholder}`);
                } else {
                    // Fallback to append at the end if the placeholder wasn't present
                    finalMedia.push({
                        url: result.url,
                        type: fileType
                    });
                    console.log(`Appended new file directly since placeholder ${placeholder} was not found.`);
                }
                console.log(`New media ${i + 1} (${fileType}) uploaded to Supabase:`, result.url);
            }
        } catch (uploadError) {
            console.error('Error uploading new media to Supabase:', uploadError);
            return res.status(500).json({
                error: 'Failed to upload new media files',
                details: uploadError.message
            });
        }

        // 3. Keep legacy columns populated for backward compatibility
        const image_url = finalMedia[0]?.url || null;
        const image_url2 = finalMedia[1]?.url || null;
        const image_url3 = finalMedia[2]?.url || null;
        const image_url4 = finalMedia[3]?.url || null;

        // Rest of the update logic
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

        // Fetch category name if category_id is provided
        let categoryName = null;
        if (categoryIdInt) {
            const catResult = await pool.query('SELECT name FROM categories WHERE id = $1', [categoryIdInt]);
            if (catResult.rows.length > 0) {
                categoryName = catResult.rows[0].name;
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
                image_url4 = $14,
                offer_percentage = $15,
                category = COALESCE($16, category),
                media = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $18 
            RETURNING *
        `, [
            name,
            description,
            price,
            categoryIdInt, // Use sanitized ID
            stock_quantity,
            usage_instructions,
            size,
            benefits,
            ingredients,
            product_details,
            image_url,
            image_url2,
            image_url3,
            image_url4,
            offerNum,
            categoryName, // $16
            JSON.stringify(finalMedia), // $17
            id // $18
        ]);

        if (updatedProduct.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update product_categories if category_ids provided
        if (category_ids) {
            let categoryIdsArray = [];
            try {
                const parsed = JSON.parse(category_ids);
                categoryIdsArray = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                categoryIdsArray = Array.isArray(category_ids) ? category_ids : [category_ids];
            }

            if (categoryIdsArray.length > 0) {
                // Delete existing
                await pool.query('DELETE FROM product_categories WHERE product_id = $1', [id]);

                // Insert new
                const categoryValues = categoryIdsArray
                    .filter(catId => !isNaN(parseInt(catId)))
                    .map(catId => `(${id}, ${parseInt(catId)})`)
                    .join(',');

                if (categoryValues) {
                    await pool.query(`
                        INSERT INTO product_categories (product_id, category_id)
                        VALUES ${categoryValues}
                        ON CONFLICT DO NOTHING
                    `);
                }
            }
        }

        // Fetch the complete product with categories to return
        const fullProduct = await pool.query(`
            SELECT 
                p.*,
                c.name as category_name,
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', cat.id, 'name', cat.name)) 
                    FILTER (WHERE cat.id IS NOT NULL), 
                    '[]'
                ) as categories
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_categories pc_link ON p.id = pc_link.product_id
            LEFT JOIN categories cat ON pc_link.category_id = cat.id
            WHERE p.id = $1
            GROUP BY p.id, c.name
        `, [id]);

        const finalResult = fullProduct.rows[0];
        console.log('Final updated product with categories:', {
            id: finalResult.id,
            name: finalResult.name,
            categories: finalResult.categories
        });

        res.json(finalResult);
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