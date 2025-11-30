const express = require('express');
const cors = require('cors');
// const db = require('./db'); // No longer needed
const { identifyUser } = require('./middleware/auth');

function createApp(eventBridge) {
    const app = express();

    const webUrl = process.env.pickleglass_WEB_URL || 'http://localhost:3000';
    console.log(`🔧 Backend CORS configured for: ${webUrl}`);

    // CORS configuration - allow both web app and Chrome extension
    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, Postman, Chrome extensions)
            if (!origin) return callback(null, true);
            
            // Allow web app origin
            if (origin === webUrl) return callback(null, true);
            
            // Allow Chrome extension origins (chrome-extension://)
            if (origin.startsWith('chrome-extension://')) return callback(null, true);
            
            // Allow localhost for development
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                return callback(null, true);
            }
            
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    }));

    // Increase body size limit for large HTML content from Chrome extension
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    app.get('/', (req, res) => {
        res.json({ message: "pickleglass API is running" });
    });

    app.use((req, res, next) => {
        req.bridge = eventBridge;
        next();
    });

    // Apply auth middleware to most routes, but exclude read-content (used by extension)
    app.use('/api', (req, res, next) => {
        // Skip auth for read-content endpoint (Chrome extension)
        if (req.path === '/read-content' || req.path === '/health') {
            return next();
        }
        identifyUser(req, res, next);
    });

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/user', require('./routes/user'));
    app.use('/api/conversations', require('./routes/conversations'));
    app.use('/api/presets', require('./routes/presets'));
    app.use('/api', require('./routes/read')); // Read content endpoint (no auth required for extension)

    // Health check endpoint for Chrome extension
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'online',
            service: 'Glass API',
            timestamp: new Date().toISOString()
        });
    });

    // Endpoint for extension to poll for read requests
    app.get('/api/extension/read-request', (req, res) => {
        const readService = require('../../src/features/read/readService');
        const request = readService.getPendingReadRequest();
        
        if (request) {
            console.log(`[Read API] Extension polling - read request found (age: ${Date.now() - request.timestamp}ms)`);
            res.json({
                hasRequest: true,
                sessionId: request.sessionId,
                timestamp: request.timestamp
            });
        } else {
            res.json({
                hasRequest: false
            });
        }
    });

    // Endpoint for extension to acknowledge read request (after reading)
    app.post('/api/extension/read-ack', (req, res) => {
        const readService = require('../../src/features/read/readService');
        readService.clearPendingReadRequest();
        res.json({ success: true });
    });

    // Endpoint for native messaging host to trigger read
    app.post('/api/extension/trigger-read', async (req, res) => {
        // This endpoint is called by the native host
        // The native host will forward the request to the extension
        res.json({ success: true, message: 'Request forwarded to extension' });
    });

    // Endpoint for native host to notify when read is complete
    app.post('/api/extension/read-complete', async (req, res) => {
        const readService = require('../../src/features/read/readService');
        // Clear the pending request since extension completed it
        readService.clearPendingReadRequest();
        res.json({ success: true });
    });

    app.get('/api/sync/status', (req, res) => {
        res.json({
            status: 'online',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    });

    app.post('/api/desktop/set-user', (req, res) => {
        res.json({
            success: true,
            message: "Direct IPC communication is now used. This endpoint is deprecated.",
            user: req.body,
            deprecated: true
        });
    });

    app.get('/api/desktop/status', (req, res) => {
        res.json({
            connected: true,
            current_user: null,
            communication_method: "IPC",
            file_based_deprecated: true
        });
    });

    return app;
}

module.exports = createApp;
