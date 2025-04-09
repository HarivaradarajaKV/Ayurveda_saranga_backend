const { spawn } = require('child_process');
const path = require('path');

// Function to start the server
function startServer() {
    console.log('Starting server...');
    
    const server = spawn('node', ['server.js'], {
        stdio: 'inherit',
        env: {
            ...process.env,
            PORT: 5001,
            NODE_ENV: 'development'
        }
    });

    server.on('error', (err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });

    process.on('SIGINT', () => {
        console.log('Shutting down server...');
        server.kill();
        process.exit();
    });
}

// Start the server
startServer(); 