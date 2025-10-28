const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');

// Email configuration with fallback for missing credentials
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'demo@example.com',
        pass: process.env.EMAIL_PASSWORD || 'demo-password'
    }
});

// Add detailed error logging for email verification
transporter.verify((error, success) => {
    if (error) {
        console.warn('SMTP connection error details (Email functionality disabled):', {
            error: error.message,
            code: error.code,
            command: error.command,
            responseCode: error.responseCode,
            response: error.response
        });
        console.warn('To enable email functionality, set EMAIL_USER and EMAIL_PASSWORD environment variables');
    } else {
        console.log('SMTP connection successful');
    }
});

// Generate OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP temporarily (in production, use Redis or similar)
const otpStore = new Map();

// Enhanced OTP email sending with better error handling
const sendOTP = async (email, otp) => {
    try {
        console.log('Attempting to send OTP email to:', email);
        
        // Check if email credentials are available
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD || 
            process.env.EMAIL_USER === 'demo@example.com') {
            console.warn('Email credentials not configured. OTP will be logged to console instead.');
            console.log(`OTP for ${email}: ${otp}`);
            return true; // Return success to allow development without email
        }
        
        const mailOptions = {
            from: {
                name: 'Saranga Ayurveda',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'Email Verification - Saranga Ayurveda',
            html: `
                <h2>Welcome to Saranga Ayurveda!</h2>
                <p>Your verification code is: <strong>${otp}</strong></p>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this code, please ignore this email.</p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('Detailed email sending error:', {
            error: error.message,
            code: error.code,
            command: error.command,
            responseCode: error.responseCode,
            response: error.response
        });
        
        // In development, log the OTP instead of failing
        if (process.env.NODE_ENV === 'development') {
            console.log(`Development mode: OTP for ${email}: ${otp}`);
            return true;
        }
        
        throw new Error('Failed to send OTP email: ' + error.message);
    }
};

// Request signup OTP
router.post('/request-signup-otp', async (req, res) => {
    try {
        console.log('[OTP Request] Received request:', {
            body: req.body,
            headers: req.headers
        });

        const { email } = req.body;

        if (!email) {
            console.log('[OTP Request] Email missing in request');
            return res.status(400).json({ 
                error: 'Email is required',
                received: req.body 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[OTP Request] Invalid email format:', email);
            return res.status(400).json({ 
                error: 'Invalid email format',
                received: email 
            });
        }

        // Check if user already exists
        console.log('[OTP Request] Checking if user exists:', email);
        const userExists = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (userExists.rows.length > 0) {
            console.log('[OTP Request] User already exists:', email);
            return res.status(400).json({ error: 'User already exists' });
        }

        // Generate and store OTP
        const otp = generateOTP();
        console.log('[OTP Request] Generated OTP for', email);

        otpStore.set(email, {
            otp,
            timestamp: Date.now(),
            attempts: 0
        });

        // Send OTP via email
        try {
            console.log('[OTP Request] Attempting to send OTP email to:', email);
            await sendOTP(email, otp);
            console.log('[OTP Request] OTP sent successfully to:', email);
            
            res.json({ 
                message: 'Verification code sent to your email',
                email,
                debug: process.env.NODE_ENV === 'development' ? {
                    emailSent: true,
                    timestamp: new Date().toISOString()
                } : undefined
            });
        } catch (emailError) {
            console.error('[OTP Request] Failed to send OTP email:', {
                error: emailError.message,
                code: emailError.code,
                command: emailError.command,
                responseCode: emailError.responseCode,
                response: emailError.response
            });
            
            // Clear the stored OTP if email sending fails
            otpStore.delete(email);
            
            res.status(500).json({ 
                error: 'Failed to send verification code',
                details: process.env.NODE_ENV === 'development' ? {
                    message: emailError.message,
                    code: emailError.code
                } : undefined
            });
        }
    } catch (error) {
        console.error('[OTP Request] Error in request-signup-otp:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            response: error.response
        });
        
        res.status(500).json({ 
            error: 'Failed to process OTP request',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code
            } : undefined
        });
    }
});

// Verify signup OTP and complete registration
router.post('/verify-signup-otp', async (req, res) => {
    try {
        const { email, otp, name, password } = req.body;

        // Validate input
        if (!email || !otp || !name || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if OTP exists and is valid
        const otpData = otpStore.get(email);
        if (!otpData) {
            return res.status(400).json({ error: 'Verification code expired or not requested' });
        }

        // Check OTP expiry (10 minutes)
        if (Date.now() - otpData.timestamp > 10 * 60 * 1000) {
            otpStore.delete(email);
            return res.status(400).json({ error: 'Verification code expired' });
        }

        // Verify OTP
        if (otpData.otp !== otp) {
            otpData.attempts += 1;
            if (otpData.attempts >= 3) {
                otpStore.delete(email);
                return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
            }
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create verified user
        const newUser = await pool.query(
            'INSERT INTO users (email, password, name, is_verified) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
            [email, hashedPassword, name, true]
        );

        // Create token
        const token = jwt.sign(
            {
                id: newUser.rows[0].id,
                role: newUser.rows[0].role,
                email: newUser.rows[0].email,
                name: newUser.rows[0].name
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Clear OTP
        otpStore.delete(email);

        // Send welcome email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Welcome to Saranga Ayurveda',
                html: `
                    <h2>Welcome to Saranga Ayurveda!</h2>
                    <p>Dear ${name},</p>
                    <p>Thank you for verifying your email. Your account has been successfully created.</p>
                    <p>You can now log in and start shopping!</p>
                    <p>Best regards,<br>The Saranga Ayurveda Team</p>
                `
            });
        } catch (emailError) {
            console.error('Error sending welcome email:', emailError);
            // Don't fail registration if welcome email fails
        }

        res.json({ 
            token,
            message: 'Email verified and registration completed successfully' 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await pool.query(
            'SELECT id, email, password, name, role, is_verified FROM users WHERE email = $1',
            [email]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Validate password
        const validPassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Special handling for admin users - bypass verification check
        if (user.rows[0].role === 'admin') {
            const token = jwt.sign(
                { 
                    id: user.rows[0].id, 
                    role: user.rows[0].role,
                    email: user.rows[0].email,
                    name: user.rows[0].name
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            return res.json({ token });
        }

        // For non-admin users, check verification
        if (!user.rows[0].is_verified) {
            // Generate and send new OTP for unverified users
            const otp = generateOTP();
            otpStore.set(email, {
                otp,
                timestamp: Date.now(),
                attempts: 0
            });

            // Send OTP via email
            await sendOTP(email, otp);

            return res.status(400).json({ 
                error: 'Email not verified. A new verification code has been sent to your email.',
                needsVerification: true
            });
        }

        // Create token for verified non-admin users
        const token = jwt.sign(
            { 
                id: user.rows[0].id, 
                role: user.rows[0].role,
                email: user.rows[0].email,
                name: user.rows[0].name
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user exists
        const user = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Generate and store new OTP
        const otp = generateOTP();
        otpStore.set(email, {
            otp,
            timestamp: Date.now(),
            attempts: 0
        });

        // Send OTP via email
        await sendOTP(email, otp);

        res.json({ 
            message: 'Verification code resent to your email',
            email 
        });
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.status(500).json({ error: error.message || 'Failed to resend verification code' });
    }
});

module.exports = router; 