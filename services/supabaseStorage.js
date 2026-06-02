const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cW54b2lqbHZ0bXlnZGd6bWUiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzYwMjM5OTY0LCJleHAiOjIwNzU4MTU5NjR9.Eaj7zvUy-Hahuc5hqbIPKdLc3kk0wx79XQ4jsN7ph50';

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
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
 * Upload category image from file path
 * @param {string} filePath - Local file path
 * @param {string} categoryInfos - Category name or ID for naming
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadCategoryImage(filePath, categoryInfos) {
    const fs = require('fs');
    const path = require('path');

    try {
        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        // Sanitize category name for filename
        const safeName = String(categoryInfos).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `category-${safeName}-${Date.now()}${path.extname(filePath)}`;

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
        console.error('Error uploading category image:', error);
        throw error;
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
        // Auto-square crop to 2400x2400 for standard static images (exclude GIFs to preserve animations)
        const ext = path.extname(filePath).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            try {
                console.log('Squaring image/GIF to 2400x2400 at:', filePath);
                const jimpModule = require('jimp');
                const Jimp = jimpModule.Jimp || jimpModule;
                const img = await Jimp.read(filePath);
                const size = Math.min(img.bitmap.width, img.bitmap.height);
                const x = Math.round((img.bitmap.width - size) / 2);
                const y = Math.round((img.bitmap.height - size) / 2);
                await img.crop(x, y, size, size).resize(2400, 2400).writeAsync(filePath);
                console.log('Successfully center-squared image/GIF to 2400x2400:', filePath);
            } catch (cropError) {
                console.warn('Warning: Failed to auto-square crop using Jimp, proceeding with original:', cropError.message);
            }
        }

        // Read file
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = `product-${productId}-image${imageIndex}${path.extname(filePath)}`;

        // Determine content type
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.webm': 'video/webm',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.txt': 'text/plain'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';

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

/**
 * Create a signed upload URL for secure client-side uploads
 * @param {string} fileName - The desired name for the file
 * @returns {Promise<{signedUrl: string, publicUrl: string, path: string}>}
 */
async function createSignedUploadUrl(fileName) {
    try {
        const timestamp = Date.now();
        const fileExtension = fileName.split('.').pop();
        const cleanName = fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueFileName = `product-${timestamp}-${cleanName}.${fileExtension}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUploadUrl(uniqueFileName);

        if (error) {
            console.error('Supabase createSignedUploadUrl error:', error);
            throw new Error(`Failed to create signed URL: ${error.message}`);
        }

        // Get public URL path
        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(uniqueFileName);

        return {
            signedUrl: data.signedUrl,
            publicUrl: publicUrlData.publicUrl,
            path: uniqueFileName
        };
    } catch (error) {
        console.error('Error in createSignedUploadUrl:', error);
        throw error;
    }
}

module.exports = {
    uploadImage,
    deleteImage,
    uploadProductImage,
    uploadCategoryImage,
    createSignedUploadUrl,
    checkStorageConfig,
    BUCKET_NAME
};
