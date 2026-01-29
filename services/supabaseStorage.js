const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BUCKET_NAME = 'product-images';

/**
 * Upload an image to Supabase Storage
 * @param {Buffer} fileBuffer - The image file buffer
 * @param {string} fileName - The name for the file
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<{url: string, path: string}>} - Public URL and storage path
 */
async function uploadImage(fileBuffer, fileName, contentType) {
    try {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const fileExtension = fileName.split('.').pop();
        const uniqueFileName = `${fileName.split('.')[0]}-${timestamp}.${fileExtension}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(uniqueFileName, fileBuffer, {
                contentType: contentType,
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw new Error(`Failed to upload image: ${error.message}`);
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(uniqueFileName);

        console.log('Image uploaded successfully:', publicUrlData.publicUrl);

        return {
            url: publicUrlData.publicUrl,
            path: uniqueFileName
        };
    } catch (error) {
        console.error('Error in uploadImage:', error);
        throw error;
    }
}

/**
 * Delete an image from Supabase Storage
 * @param {string} imageUrl - The full public URL or path of the image
 * @returns {Promise<boolean>} - Success status
 */
async function deleteImage(imageUrl) {
    try {
        if (!imageUrl) {
            return true;
        }

        // Extract the file path from the URL
        let filePath;
        if (imageUrl.includes(BUCKET_NAME)) {
            // Extract path from full URL
            const urlParts = imageUrl.split(`${BUCKET_NAME}/`);
            filePath = urlParts[1];
        } else {
            // Assume it's already a path
            filePath = imageUrl;
        }

        if (!filePath) {
            console.warn('Could not extract file path from URL:', imageUrl);
            return false;
        }

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) {
            console.error('Supabase delete error:', error);
            return false;
        }

        console.log('Image deleted successfully:', filePath);
        return true;
    } catch (error) {
        console.error('Error in deleteImage:', error);
        return false;
    }
}

/**
 * Upload product image from file path
 * @param {string} filePath - Local file path
 * @param {string} productId - Product ID for naming
 * @param {number} imageIndex - Image index (1, 2, or 3)
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadProductImage(filePath, productId, imageIndex) {
    const fs = require('fs');
    const path = require('path');

    try {
        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = `product-${productId}-image${imageIndex}${path.extname(filePath)}`;

        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        const contentType = contentTypeMap[ext] || 'image/jpeg';

        const result = await uploadImage(fileBuffer, fileName, contentType);

        // Clean up: Delete local temporary file
        try {
            fs.unlinkSync(filePath);
        } catch (cleanupError) {
            console.warn('Warning: Failed to delete temporary file:', filePath, cleanupError.message);
        }

        return result;
    } catch (error) {
        console.error('Error uploading product image:', error);
        throw error;
    }
}

/**
 * Check if Supabase Storage is properly configured
 * @returns {Promise<boolean>}
 */
async function checkStorageConfig() {
    try {
        // Try to list buckets to verify connection
        const { data, error } = await supabase.storage.listBuckets();

        if (error) {
            console.error('Supabase Storage connection error:', error);
            return false;
        }

        // Check if product-images bucket exists
        const bucketExists = data.some(bucket => bucket.name === BUCKET_NAME);

        if (!bucketExists) {
            console.warn(`Warning: Bucket '${BUCKET_NAME}' does not exist. Please create it in Supabase Dashboard.`);
            return false;
        }

        console.log('Supabase Storage is properly configured');
        return true;
    } catch (error) {
        console.error('Error checking Supabase Storage config:', error);
        return false;
    }
}

module.exports = {
    uploadImage,
    deleteImage,
    uploadProductImage,
    checkStorageConfig,
    BUCKET_NAME
};
