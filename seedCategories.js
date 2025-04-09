const pool = require('./db');
require('dotenv').config();

const defaultCategories = [
    {
        name: 'Skincare',
        description: 'Products for skin care and maintenance',
        image_url: 'https://example.com/skincare.jpg'
    },
    {
        name: 'Makeup',
        description: 'Cosmetic products for beauty enhancement',
        image_url: 'https://example.com/makeup.jpg'
    },
    {
        name: 'Haircare',
        description: 'Products for hair care and styling',
        image_url: 'https://example.com/haircare.jpg'
    },
    {
        name: 'Fragrances',
        description: 'Perfumes and body sprays',
        image_url: 'https://example.com/fragrances.jpg'
    },
    {
        name: 'Bath & Body',
        description: 'Body care and bathing products',
        image_url: 'https://example.com/bath-body.jpg'
    }
];

const subCategories = {
    'Skincare': [
        'Face Creams',
        'Serums',
        'Cleansers',
        'Masks',
        'Sunscreen'
    ],
    'Makeup': [
        'Lipstick',
        'Foundation',
        'Eye Makeup',
        'Blush',
        'Brushes'
    ],
    'Haircare': [
        'Shampoo',
        'Conditioner',
        'Hair Oils',
        'Hair Masks',
        'Styling Products'
    ],
    'Fragrances': [
        'Women\'s Perfume',
        'Men\'s Cologne',
        'Body Mists',
        'Gift Sets'
    ],
    'Bath & Body': [
        'Body Wash',
        'Lotions',
        'Scrubs',
        'Hand Care',
        'Body Oils'
    ]
};

async function seedCategories() {
    try {
        // Insert main categories first
        for (const category of defaultCategories) {
            const result = await pool.query(
                'INSERT INTO categories (name, description, image_url) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING RETURNING id, name',
                [category.name, category.description, category.image_url]
            );
            console.log(`Added main category: ${category.name}`);

            // Get the category ID (either from the insert or from existing category)
            let categoryId;
            if (result.rows.length > 0) {
                categoryId = result.rows[0].id;
            } else {
                const existing = await pool.query('SELECT id FROM categories WHERE name = $1', [category.name]);
                categoryId = existing.rows[0].id;
            }

            // Insert subcategories
            const subs = subCategories[category.name];
            for (const subName of subs) {
                await pool.query(
                    'INSERT INTO categories (name, description, parent_id) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
                    [subName, `${subName} in ${category.name} category`, categoryId]
                );
                console.log(`Added subcategory: ${subName} under ${category.name}`);
            }
        }

        console.log('Categories seeding completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding categories:', error);
        process.exit(1);
    }
}

seedCategories(); 