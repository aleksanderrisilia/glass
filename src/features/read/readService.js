const { BrowserWindow } = require('electron');
const sessionRepository = require('../common/repositories/session');
const readRepository = require('./repositories');
const internalBridge = require('../../bridge/internalBridge');
const fetch = require('node-fetch');
const WebSocket = require('ws');

class ReadService {
    constructor() {
        this.currentReadContent = null;
        this.currentSessionId = null;
        this.chromeDebugPort = 9222; // Default Chrome remote debugging port
        this.pendingReadRequest = null; // Flag to signal extension to read tab
        this.readRequestTimestamp = null;
        console.log('[ReadService] Service instance created.');
    }

    /**
     * Connect to Chrome's DevTools Protocol and get active tab info
     * @returns {Promise<Object>} Chrome CDP connection info
     */
    async connectToChrome() {
        try {
            // Try to connect to Chrome's remote debugging port
            const response = await fetch(`http://localhost:${this.chromeDebugPort}/json`);
            if (!response.ok) {
                throw new Error(`Chrome debug port returned ${response.status}`);
            }
            const tabs = await response.json();
            
            if (!tabs || tabs.length === 0) {
                throw new Error('No Chrome tabs found. Make sure Chrome is running with remote debugging enabled.');
            }

            // Find the active tab (prefer non-chrome:// pages)
            const activeTab = tabs.find(tab => 
                tab.type === 'page' && 
                !tab.url.startsWith('chrome://') && 
                !tab.url.startsWith('chrome-extension://') &&
                !tab.url.startsWith('about:')
            ) || tabs.find(tab => tab.type === 'page') || tabs[0];

            if (!activeTab || !activeTab.webSocketDebuggerUrl) {
                throw new Error('No suitable Chrome tab with WebSocket debugger URL found.');
            }

            return {
                webSocketDebuggerUrl: activeTab.webSocketDebuggerUrl,
                id: activeTab.id,
                title: activeTab.title || 'Untitled',
                url: activeTab.url || ''
            };
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
                throw new Error(
                    'Cannot connect to Chrome. Please start Chrome with remote debugging enabled:\n' +
                    'Windows: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n' +
                    'Or add --remote-debugging-port=9222 to Chrome shortcut'
                );
            }
            throw error;
        }
    }

    /**
     * Get HTML content from Chrome tab using CDP WebSocket
     * @param {string} webSocketDebuggerUrl - WebSocket URL for CDP connection
     * @returns {Promise<string>} HTML content
     */
    async getTabHTML(webSocketDebuggerUrl) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(webSocketDebuggerUrl);
            let messageId = 1;
            const pendingRequests = new Map();

            ws.on('open', () => {
                console.log('[ReadService] WebSocket connected to Chrome CDP');
                
                // Enable Page domain
                ws.send(JSON.stringify({
                    id: messageId++,
                    method: 'Page.enable'
                }));

                // Get the outer HTML of the document
                const getHTMLRequest = {
                    id: messageId++,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: 'document.documentElement.outerHTML'
                    }
                };
                
                pendingRequests.set(getHTMLRequest.id, { resolve, reject });
                ws.send(JSON.stringify(getHTMLRequest));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    // Handle responses
                    if (message.id && pendingRequests.has(message.id)) {
                        const { resolve: resolveRequest, reject: rejectRequest } = pendingRequests.get(message.id);
                        pendingRequests.delete(message.id);

                        if (message.error) {
                            rejectRequest(new Error(message.error.message || 'CDP error'));
                            ws.close();
                            return;
                        }

                        if (message.result) {
                            if (message.result.result && message.result.result.value) {
                                // Got the HTML content
                                resolve(message.result.result.value);
                                ws.close();
                            } else {
                                // Page.enable response, continue
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('[ReadService] Error parsing CDP message:', error);
                    reject(error);
                    ws.close();
                }
            });

            ws.on('error', (error) => {
                console.error('[ReadService] WebSocket error:', error);
                reject(new Error(`WebSocket connection failed: ${error.message}`));
            });

            ws.on('close', () => {
                // If we haven't resolved yet, reject
                if (pendingRequests.size > 0) {
                    const error = new Error('WebSocket closed before receiving response');
                    for (const { reject: rejectRequest } of pendingRequests.values()) {
                        rejectRequest(error);
                    }
                    pendingRequests.clear();
                }
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (pendingRequests.size > 0) {
                    ws.close();
                    reject(new Error('Timeout waiting for Chrome CDP response'));
                }
            }, 10000);
        });
    }

    /**
     * Request the Chrome extension to read the current tab
     * Sets a flag that the extension polls for
     * @returns {Promise<{success: boolean, error?: string, data?: Object}>}
     */
    async readCurrentTab() {
        try {
            console.log('[ReadService] Requesting Chrome extension to read current tab...');

            // Get or create active session
            const sessionId = await sessionRepository.getOrCreateActive('ask');
            this.currentSessionId = sessionId;

            // Set a read request flag that the extension will poll for
            this.pendingReadRequest = {
                sessionId: sessionId,
                timestamp: Date.now()
            };
            this.readRequestTimestamp = Date.now();
            
            // Also try to trigger via native messaging host (if available)
            this.triggerNativeHost();
            
            console.log('[ReadService] Read request set. Extension will poll and read the tab.');

            // Wait for the extension to read the tab (poll for result)
            // Check every 500ms for up to 15 seconds (extension polls every 1.5s, so need more time)
            const maxWaitTime = 15000; // 15 seconds
            const checkInterval = 500; // 500ms
            const startTime = Date.now();

            return new Promise((resolve) => {
                const checkForContent = async () => {
                    // Check if extension has sent content
                    const recentContent = await readRepository.getLatestBySessionId(sessionId);
                    
                    if (recentContent) {
                        const now = Math.floor(Date.now() / 1000);
                        const readTime = recentContent.read_at || recentContent.created_at;
                        const timeDiff = now - readTime;

                        const requestAgeMs = this.readRequestTimestamp ? (Date.now() - this.readRequestTimestamp) : 0;
                        const requestAgeSeconds = Math.round(requestAgeMs / 1000);
                        
                        console.log(`[ReadService] Found content: age=${timeDiff}s, requestAge=${requestAgeSeconds}s, sessionId=${sessionId}, contentSessionId=${recentContent.session_id}`);

                        // If content was read in the last 10 seconds AND session IDs match, it's from this request
                        // Don't check requestAge - if content is fresh and session matches, use it
                        if (timeDiff <= 10 && recentContent.session_id === sessionId) {
                            this.currentReadContent = recentContent;
                            this.pendingReadRequest = null; // Clear request
                            
                            console.log(`[ReadService] Extension read content: ${recentContent.title || 'Untitled'}`);

                            this.sendToRenderer('read-complete', {
                                success: true,
                                url: recentContent.url,
                                title: recentContent.title,
                                contentLength: recentContent.html_content?.length || 0
                            });

                            resolve({
                                success: true,
                                data: {
                                    id: recentContent.id,
                                    url: recentContent.url,
                                    title: recentContent.title,
                                    contentLength: recentContent.html_content?.length || 0,
                                    message: 'Content read via Chrome extension'
                                }
                            });
                            return;
                        }
                    }

                    // Check if timeout
                    if (Date.now() - startTime > maxWaitTime) {
                        const requestAge = Date.now() - (this.readRequestTimestamp || 0);
                        this.pendingReadRequest = null; // Clear request
                        const errorMessage = `Extension did not respond in time (waited ${Math.round(maxWaitTime/1000)}s, request age: ${Math.round(requestAge/1000)}s). Make sure the Glass Chrome extension is installed and active. Check the extension's service worker console.`;
                        console.log('[ReadService]', errorMessage);
                        console.log('[ReadService] Tip: Open chrome://extensions, find Glass extension, click "service worker" to see if it\'s polling');

                        this.sendToRenderer('read-error', {
                            success: false,
                            error: errorMessage,
                            needsExtension: true
                        });

                        resolve({
                            success: false,
                            error: errorMessage,
                            needsExtension: true
                        });
                        return;
                    }

                    // Continue checking
                    setTimeout(checkForContent, checkInterval);
                };

                // Start checking
                setTimeout(checkForContent, checkInterval);
            });

        } catch (error) {
            console.error('[ReadService] Error requesting read:', error);
            this.pendingReadRequest = null;
            const errorMessage = error.message || 'Unknown error occurred';
            
            this.sendToRenderer('read-error', {
                success: false,
                error: errorMessage
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Get pending read request (called by extension polling endpoint)
     * @returns {Object|null} Pending read request or null
     */
    getPendingReadRequest() {
        // Clear request if it's older than 30 seconds
        if (this.pendingReadRequest && this.readRequestTimestamp) {
            const age = Date.now() - this.readRequestTimestamp;
            if (age > 30000) {
                this.pendingReadRequest = null;
                this.readRequestTimestamp = null;
                return null;
            }
        }
        return this.pendingReadRequest;
    }

    /**
     * Clear pending read request (called after extension reads)
     */
    clearPendingReadRequest() {
        this.pendingReadRequest = null;
        this.readRequestTimestamp = null;
    }

    /**
     * Trigger native messaging host to send read request to extension
     */
    async triggerNativeHost() {
        try {
            const http = require('http');
            const postData = JSON.stringify({});
            const options = {
                hostname: 'localhost',
                port: 51174, // Native host HTTP server port
                path: '/trigger-read',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 1000 // Quick timeout, don't wait if native host not running
            };

            const req = http.request(options, (res) => {
                // Native host received the request
            });

            req.on('error', (error) => {
                // Native host not running, fall back to polling
                console.log('[ReadService] Native host not available, using polling fallback');
            });

            req.on('timeout', () => {
                req.destroy();
            });

            req.write(postData);
            req.end();
        } catch (error) {
            // Ignore errors, fall back to polling
            console.log('[ReadService] Native host trigger failed, using polling fallback');
        }
    }

    /**
     * Get the latest read content for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>}
     */
    async getLatestReadContent(sessionId) {
        return await readRepository.getLatestBySessionId(sessionId);
    }

    /**
     * Send message to renderer
     * @param {string} channel - IPC channel name
     * @param {Object} data - Data to send
     */
    sendToRenderer(channel, data) {
        const { windowPool } = require('../../window/windowManager');
        const readWindow = windowPool?.get('read');
        
        if (readWindow && !readWindow.isDestroyed()) {
            readWindow.webContents.send(channel, data);
        }

        // Also send to header if needed
        const header = windowPool?.get('header');
        if (header && !header.isDestroyed()) {
            header.webContents.send(`read:${channel}`, data);
        }
    }

    /**
     * Initialize the service
     */
    initialize() {
        console.log('[ReadService] Initialized and ready.');
    }
}

module.exports = new ReadService();

