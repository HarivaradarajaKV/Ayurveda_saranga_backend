const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();

// WebSocket connections store
const clients = new Map();

// Enhanced CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            console.log('Allowing request with no origin');
            return callback(null, true);
        }
        
        console.log('Incoming request from origin:', origin);
        
        // During development, accept all origins
        callback(null, true);
        
        // Log the allowed request
        console.log('CORS: Allowed request from origin:', origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// Body parsing middleware with logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads', 'profile-photos');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    if (req.method === 'POST') {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route handler
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Ayurveda Saranga API',
        status: 'active',
        endpoints: {
            health: '/api/health',
            products: '/api/products',
            categories: '/api/categories',
            auth: '/api/auth',
            orders: '/api/orders',
            cart: '/api/cart',
            wishlist: '/api/wishlist'
        }
    });
});

// API Routes
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const addressesRouter = require('./routes/addresses');
const brandReviewsRouter = require('./routes/brandReviews');
const couponsRouter = require('./routes/coupons');
const paymentsRouter = require('./routes/payments');
const ordersRouter = require('./routes/orders');
const razorpayRouter = require('./routes/razorpay');

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/brand-reviews', brandReviewsRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/razorpay', razorpayRouter);

app.use('/api/cart', require('./routes/cart'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/users', require('./routes/users'));
app.use('/orders', ordersRouter);

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: 'ok',
            dbTime: result.rows[0].now,
            message: 'Database connection successful'
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ 
            status: 'error',
            message: error.message
        });
    }
});

// Serve static files only if web-build directory exists
const webBuildPath = path.join(__dirname, '../web-build');
if (fs.existsSync(webBuildPath)) {
    app.use(express.static(webBuildPath));
    
    // Handle Expo web routing
    app.get('/admin/*', (req, res) => {
        res.sendFile(path.join(webBuildPath, 'index.html'));
    });

    app.get('*', (req, res) => {
        res.sendFile(path.join(webBuildPath, 'index.html'));
    });
} else {
    console.log('Web build directory not found. Skipping static file serving.');
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5001;

// Test database connection before starting server
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        process.exit(1);
    }
    release();
    console.log('Database connection successful');

    // Start server after successful database connection
    let server;
    try {
        server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            
            // Only log network interfaces in development
            if (process.env.NODE_ENV !== 'production') {
                const interfaces = require('os').networkInterfaces();
                const addresses = [];
                
                // Get all network interfaces
                for (const iface of Object.values(interfaces)) {
                    for (const alias of iface) {
                        if (alias.family === 'IPv4' && !alias.internal) {
                            addresses.push(alias.address);
                        }
                    }
                }

                console.log('Server is accessible at:');
                console.log(`- Local: http://localhost:${PORT}`);
                addresses.forEach(addr => {
                    console.log(`- Network: http://${addr}:${PORT}`);
                });
                
                // Enable CORS for all Expo development URLs
                const allowedOrigins = [
                    'http://localhost:19006',
                    'http://localhost:19000',
                    'http://localhost:8081',
                    ...addresses.map(addr => `http://${addr}:19000`),
                    ...addresses.map(addr => `http://${addr}:19006`),
                    ...addresses.map(addr => `http://${addr}:8081`),
                    ...addresses.map(addr => `http://${addr}:${PORT}`)
                ];
                
                console.log('CORS enabled for origins:', allowedOrigins);
            }
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use. Trying another port...`);
                server.close();
                const newPort = parseInt(PORT) + 1;
                process.env.PORT = newPort;
                server = app.listen(newPort);
            } else {
                console.error('Server error:', error);
            }
        });

        // Initialize WebSocket server
        const wss = new WebSocket.Server({ server });

        // Helper function to get user data
        async function getUserData(userId) {
            try {
                // Get cart items
                const cartResult = await pool.query('SELECT * FROM cart_items WHERE user_id = $1', [userId]);
                
                // Get wishlist items
                const wishlistResult = await pool.query('SELECT * FROM wishlist_items WHERE user_id = $1', [userId]);
                
                // Get user profile
                const profileResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
                
                return {
                    cart: cartResult.rows,
                    wishlist: wishlistResult.rows,
                    profile: profileResult.rows[0]
                };
            } catch (error) {
                console.error('Error fetching user data:', error);
                return null;
            }
        }

        wss.on('connection', (ws) => {
            console.log('New WebSocket connection');
            let currentUserId = null;
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log('WebSocket received:', data);
                    
                    // Handle user authentication
                    if (data.type === 'auth') {
                        currentUserId = data.userId;
                        // Store the connection with the user ID
                        if (!clients.has(currentUserId)) {
                            clients.set(currentUserId, new Set());
                        }
                        clients.get(currentUserId).add(ws);
                        console.log(`User ${currentUserId} connected. Total connections: ${clients.get(currentUserId).size}`);
                    }
                    
                    // Handle sync request
                    if (data.type === 'sync_request' && currentUserId) {
                        const userData = await getUserData(currentUserId);
                        if (userData) {
                            ws.send(JSON.stringify({
                                type: 'SYNC_DATA',
                                payload: userData
                            }));
                        }
                    }
                    
                    // Handle updates
                    if (data.type === 'update' && currentUserId) {
                        const { action, payload } = data;
                        // Broadcast to all connections of the same user except sender
                        if (clients.has(currentUserId)) {
                            clients.get(currentUserId).forEach((client) => {
                                if (client !== ws && client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: action,
                                        payload
                                    }));
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });

            ws.on('close', () => {
                if (currentUserId && clients.has(currentUserId)) {
                    const connections = clients.get(currentUserId);
                    connections.delete(ws);
                    if (connections.size === 0) {
                        clients.delete(currentUserId);
                    }
                    console.log(`User ${currentUserId} disconnected. Remaining connections: ${connections.size}`);
                }
            });
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}); 