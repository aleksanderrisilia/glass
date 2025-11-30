#!/usr/bin/env node
/**
 * Chrome Native Messaging Host for Glass Extension
 * This script acts as a bridge between Electron and the Chrome extension
 */

const http = require('http');

const GLASS_API_PORT = 51173;
const NATIVE_HOST_PORT = 51174; // Port for Electron to communicate with native host

// Native Messaging protocol: messages are length-prefixed JSON
function sendMessage(message) {
    const json = JSON.stringify(message);
    const buffer = Buffer.from(json, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(buffer.length, 0);
    process.stdout.write(length);
    process.stdout.write(buffer);
}

function readMessage() {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;
        let buffer = Buffer.alloc(0);
        let expectedLength = null;

        function readChunk() {
            const chunk = stdin.read();
            if (chunk === null) {
                return;
            }

            buffer = Buffer.concat([buffer, chunk]);

            while (true) {
                if (expectedLength === null) {
                    if (buffer.length < 4) {
                        break; // Need more data for length
                    }
                    expectedLength = buffer.readUInt32LE(0);
                    buffer = buffer.slice(4);
                }

                if (buffer.length >= expectedLength) {
                    const message = JSON.parse(buffer.slice(0, expectedLength).toString('utf8'));
                    buffer = buffer.slice(expectedLength);
                    expectedLength = null;
                    resolve(message);
                    return;
                } else {
                    break; // Need more data
                }
            }
        }

        stdin.on('readable', readChunk);
        stdin.on('error', reject);
        stdin.on('end', () => reject(new Error('Stdin closed')));
    });
}

let extensionPort = null; // Connection to extension

// Handle messages from extension
function handleExtensionMessage(message) {
    if (message.type === 'PING') {
        sendMessage({ type: 'PONG' });
    } else if (message.type === 'READ_TAB_COMPLETE') {
        // Extension completed reading, forward to Electron
        const postData = JSON.stringify(message.data || {});
        const options = {
            hostname: 'localhost',
            port: GLASS_API_PORT,
            path: '/api/extension/read-complete',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            // Just log, don't send response back to extension
        });

        req.on('error', (error) => {
            console.error('[Native Host] Failed to notify Electron:', error);
        });

        req.write(postData);
        req.end();
    }
}

// Send message to extension
function sendToExtension(message) {
    if (extensionPort) {
        sendMessage(message);
    } else {
        console.error('[Native Host] Extension not connected');
    }
}

// HTTP server for Electron to send read requests
function startHttpServer() {
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/trigger-read') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                // Send read request to extension
                sendToExtension({ type: 'READ_TAB_REQUEST' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Read request sent to extension' }));
            });
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(NATIVE_HOST_PORT, '127.0.0.1', () => {
        console.error(`[Native Host] HTTP server listening on port ${NATIVE_HOST_PORT}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`[Native Host] Port ${NATIVE_HOST_PORT} already in use`);
        } else {
            console.error('[Native Host] HTTP server error:', error);
        }
    });
}

// Main loop
function main() {
    // Start HTTP server for Electron communication
    startHttpServer();

    // Send initial connection message to extension
    sendMessage({ type: 'CONNECTED' });
    extensionPort = true; // Mark as connected

    function processNextMessage() {
        readMessage()
            .then((message) => {
                handleExtensionMessage(message);
                processNextMessage(); // Continue processing
            })
            .catch((error) => {
                if (error.message === 'Stdin closed' || error.message.includes('Stdin closed')) {
                    process.exit(0);
                }
                console.error('Error handling message:', error);
                sendMessage({ type: 'ERROR', error: error.message });
                processNextMessage(); // Continue even on error
            });
    }

    processNextMessage();
}

// Handle process signals
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Start
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

