const router = require('express').Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { uploadProductImage } = require('../services/supabaseStorage');

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, os.tmpdir());
    },
    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only documents
    if (!file.originalname.match(/\.(pdf|doc|docx|txt)$/i)) {
        return cb(new Error('Only document files (PDF, DOC, DOCX, TXT) are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

const uploadFields = upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
]);

// 1. POST /api/submissions/contact (Contact Us Submission)
router.post('/contact', async (req, res) => {
    try {
        const { fullName, email, phoneCode, phoneNumber, subject, message } = req.body;

        if (!fullName || !email || !subject || !message) {
            return res.status(400).json({ success: false, error: 'Full name, email, subject, and message are required' });
        }

        const result = await pool.query(
            `INSERT INTO contact_submissions (full_name, email, phone_code, phone_number, subject, message)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [fullName, email, phoneCode || null, phoneNumber || null, subject, message]
        );

        res.status(201).json({ success: true, submission: result.rows[0] });
    } catch (error) {
        console.error('Error saving contact submission:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. POST /api/submissions/career (Careers / Internships Application)
router.post('/career', uploadFields, async (req, res) => {
    try {
        const {
            positionType,
            fullName,
            email,
            phoneCode,
            phoneNumber,
            college,
            degree,
            fieldInterest,
            semester,
            about
        } = req.body;

        if (!positionType || !fullName || !email || !phoneNumber || !college || !degree || !fieldInterest || !semester || !about) {
            return res.status(400).json({ success: false, error: 'All fields (except cover letter) are required' });
        }

        const files = req.files || {};
        const resumeFile = files['resume'] ? files['resume'][0] : null;
        const coverFile = files['cover'] ? files['cover'][0] : null;

        if (!resumeFile) {
            return res.status(400).json({ success: false, error: 'Resume file is required' });
        }

        let resumeUrl = null;
        let coverUrl = null;

        try {
            // Upload resume to Supabase Storage
            const uploadRes = await uploadProductImage(resumeFile.path, `resume-${fullName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`, Date.now());
            resumeUrl = uploadRes.url;
            console.log('Uploaded resume file to Supabase:', resumeUrl);
        } catch (uploadError) {
            console.error('Error uploading resume:', uploadError);
            return res.status(500).json({ success: false, error: 'Failed to upload resume document to storage: ' + uploadError.message });
        }

        if (coverFile) {
            try {
                // Upload cover letter if provided
                const uploadRes = await uploadProductImage(coverFile.path, `cover-${fullName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`, Date.now());
                coverUrl = uploadRes.url;
                console.log('Uploaded cover letter file to Supabase:', coverUrl);
            } catch (uploadError) {
                console.error('Error uploading cover letter:', uploadError);
                // Non-fatal, since cover is optional, but we log it
            }
        }

        const result = await pool.query(
            `INSERT INTO career_submissions (
                position_type, full_name, email, phone_code, phone_number, 
                college, degree, field_interest, semester, resume_url, cover_letter_url, about
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                positionType,
                fullName,
                email,
                phoneCode || '+91',
                phoneNumber,
                college,
                degree,
                fieldInterest,
                semester,
                resumeUrl,
                coverUrl,
                about
            ]
        );

        res.status(201).json({ success: true, submission: result.rows[0] });
    } catch (error) {
        console.error('Error saving career submission:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
