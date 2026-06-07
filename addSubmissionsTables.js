const pool = require('./db');
require('dotenv').config();

async function createSubmissionsTables() {
    try {
        console.log('--- Creating Submissions Tables ---');
        
        // 1. Contact Submissions Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contact_submissions (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone_code VARCHAR(10),
                phone_number VARCHAR(50),
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
            );
        `);
        console.log('✅ Successfully created contact_submissions table');

        // 2. Career/Internship Submissions Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS career_submissions (
                id SERIAL PRIMARY KEY,
                position_type VARCHAR(50) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone_code VARCHAR(10),
                phone_number VARCHAR(50) NOT NULL,
                college VARCHAR(255) NOT NULL,
                degree VARCHAR(255) NOT NULL,
                field_interest VARCHAR(255) NOT NULL,
                semester VARCHAR(50) NOT NULL,
                resume_url VARCHAR(500),
                cover_letter_url VARCHAR(500),
                about TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
            );
        `);
        console.log('✅ Successfully created career_submissions table');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating submissions tables:', error);
        process.exit(1);
    }
}

createSubmissionsTables();
