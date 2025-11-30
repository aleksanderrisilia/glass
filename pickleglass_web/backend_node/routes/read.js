const express = require('express');
const router = express.Router();
const readService = require('../../../src/features/read/readService');

// Endpoint for Chrome extension to send tab content
router.post('/read-content', async (req, res) => {
    try {
        const { url, title, htmlContent } = req.body;

        if (!htmlContent) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing htmlContent in request body' 
            });
        }

        console.log('[Read API] Received content from Chrome extension:', {
            url: url || 'unknown',
            title: title || 'Untitled',
            contentLength: htmlContent.length
        });

        // Use readService to store the content
        // We'll create a session and store the content
        const sessionRepository = require('../../../src/features/common/repositories/session');
        const readRepository = require('../../../src/features/read/repositories');

        // Get or create active session - use the same method as readService
        const sessionId = await sessionRepository.getOrCreateActive('ask');
        
        console.log('[Read API] Storing content for session:', sessionId);

        // Store the read content
        const result = await readRepository.create({
            sessionId,
            url: url || '',
            title: title || 'Untitled',
            htmlContent: htmlContent
        });

        console.log('[Read API] Successfully stored read content:', result.id);

        res.json({
            success: true,
            id: result.id,
            sessionId: sessionId,
            url: url,
            title: title,
            contentLength: htmlContent.length
        });
    } catch (error) {
        console.error('[Read API] Error processing read content:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process read content'
        });
    }
});

module.exports = router;

