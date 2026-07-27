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

const { adminAuth } = require('../middleware/auth');

// GET /api/submissions/contact (Retrieve all Contact Us Submissions - Admin Only)
router.get('/contact', adminAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_submissions ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching contact submissions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/submissions/career (Retrieve all Career/Internship Applications - Admin Only)
router.get('/career', adminAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM career_submissions ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching career submissions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/submissions/coming-soon-notify
router.post('/coming-soon-notify', async (req, res) => {
    try {
        const { email, categoryName } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const mailOptions = {
            from: `"Saranga Ayurveda" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Coming Soon: ${categoryName} - Saranga Ayurveda`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #fcfbf9;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <img src="https://sarangaayurveda.com/images/logo.png" alt="Saranga Ayurveda Logo" style="width: 80px; height: auto;" />
                        <h2 style="color: #2b3a1a; margin-top: 10px; font-family: 'Georgia', serif;">Saranga Ayurveda</h2>
                    </div>
                    <div style="background-color: #ffffff; padding: 24px; border-radius: 6px; border: 1px solid #eeeeee;">
                        <h3 style="color: #2b3a1a; margin-top: 0; font-family: 'Georgia', serif;">Coming Soon Notification</h3>
                        <p style="color: #444444; line-height: 1.6; font-size: 15px;">
                            Dear Customer,
                        </p>
                        <p style="color: #444444; line-height: 1.6; font-size: 15px;">
                            Thank you for showing interest in our <strong>${categoryName}</strong> collection! 
                        </p>
                        <p style="color: #444444; line-height: 1.6; font-size: 15px;">
                            We are currently crafting authentic, handpicked, and time-tested Ayurvedic formulations for this category. You will be the first to know when we launch this range.
                        </p>
                        <p style="color: #444444; line-height: 1.6; font-size: 15px; margin-bottom: 0;">
                            Stay tuned and take care!
                        </p>
                    </div>
                    <div style="text-align: center; margin-top: 20px; color: #888888; font-size: 12px; line-height: 1.4;">
                        <p>© 2025 Saranga Ayurveda. All rights reserved.</p>
                        <p>Natural • Ayurvedic • Holistic</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS coming_soon_subscribers (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    category_name VARCHAR(255) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            `);
            await pool.query(
                'INSERT INTO coming_soon_subscribers (email, category_name) VALUES ($1, $2)',
                [email, categoryName]
            );
        } catch (dbErr) {
            console.error('Error saving subscriber to DB:', dbErr.message);
        }

        res.status(200).json({ success: true, message: 'Notification email sent successfully' });
    } catch (error) {
        console.error('Error sending coming soon email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
