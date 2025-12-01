const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const readRepository = require('../read/repositories');
const sttRepository = require('../listen/stt/repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../common/services/modelStateService');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

async function captureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
        };
        console.log('[AskService] Service instance created.');
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:stateUpdate', this.state);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * Formats a timestamp (Unix seconds) to HH:MM:SS format
     * @param {number} timestamp - Unix timestamp in seconds
     * @returns {string} - Formatted time string
     * @private
     */
    _formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Formats transcripts for context with timestamps and speaker labels
     * @param {Array} transcripts - Array of transcript objects
     * @returns {string} - Formatted transcript string
     * @private
     */
    _formatTranscriptsForContext(transcripts) {
        if (!transcripts || transcripts.length === 0) {
            return '';
        }

        return transcripts
            .map(transcript => {
                const timestamp = this._formatTimestamp(transcript.start_at || transcript.created_at);
                const speaker = transcript.speaker === 'me' ? 'You' : 'Speaker';
                const text = transcript.text || '';
                return `[${timestamp}] ${speaker}: ${text}`;
            })
            .join('\n');
    }

    /**
     * Gets live transcript context from the active listen session
     * @param {string} askSessionId - The Ask session ID (for checking read content override)
     * @returns {Promise<{context: string, sessionId: string} | null>} - Transcript context or null
     * @private
     */
    async _getLiveTranscriptContext(askSessionId) {
        try {
            // Lazy require to avoid circular dependency
            const listenService = require('../listen/listenService');
            
            if (!listenService) {
                console.log('[AskService] ListenService not available');
                return null;
            }

            // Get active listen session ID
            const listenSessionId = listenService.getCurrentSessionId();
            if (!listenSessionId) {
                console.log('[AskService] No active listen session');
                return null;
            }

            // Check if listening has stopped and read content was triggered
            const isListeningActive = listenService.isSessionActive();
            if (!isListeningActive) {
                // Check if read content exists and is recent (read overrides transcripts when listening stopped)
                try {
                    const readContent = await readRepository.getLatestBySessionId(askSessionId);
                    if (readContent && readContent.html_content) {
                        const now = Math.floor(Date.now() / 1000);
                        const readTime = readContent.read_at || readContent.created_at;
                        const timeDiff = now - readTime;
                        
                        // If read content is recent (within 5 minutes), it overrides transcripts
                        if (timeDiff < 300) {
                            console.log('[AskService] Read content overrides transcripts (listening stopped)');
                            return null; // Return null to use read content instead
                        }
                    }
                } catch (error) {
                    console.warn('[AskService] Failed to check read content override:', error);
                }
            }

            // Fetch transcripts from the active listen session
            const transcripts = await sttRepository.getAllTranscriptsBySessionId(listenSessionId);
            if (!transcripts || transcripts.length === 0) {
                console.log('[AskService] No transcripts found for session', listenSessionId);
                return null;
            }

            // Format transcripts
            const formattedContext = this._formatTranscriptsForContext(transcripts);
            console.log(`[AskService] Using live transcript context from session ${listenSessionId} (${transcripts.length} transcripts, ${formattedContext.length} chars)`);
            
            return {
                context: formattedContext,
                sessionId: listenSessionId
            };
        } catch (error) {
            console.warn('[AskService] Failed to get live transcript context:', error);
            return null;
        }
    }

    /**
     * Polls for new transcripts and updates context if new ones arrive
     * @param {string} listenSessionId - The listen session ID to poll
     * @param {number} lastTranscriptCount - Last known transcript count
     * @param {number} maxPolls - Maximum number of polls
     * @param {number} pollInterval - Poll interval in milliseconds
     * @returns {Promise<string | null>} - Updated context or null if no new transcripts
     * @private
     */
    async _pollForNewTranscripts(listenSessionId, lastTranscriptCount, maxPolls = 10, pollInterval = 500) {
        for (let i = 0; i < maxPolls; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            try {
                const transcripts = await sttRepository.getAllTranscriptsBySessionId(listenSessionId);
                if (transcripts && transcripts.length > lastTranscriptCount) {
                    const newTranscripts = transcripts.slice(lastTranscriptCount);
                    const formattedNewContext = this._formatTranscriptsForContext(newTranscripts);
                    console.log(`[AskService] Found ${newTranscripts.length} new transcripts during processing`);
                    return formattedNewContext;
                }
            } catch (error) {
                console.warn('[AskService] Error polling for new transcripts:', error);
                break;
            }
        }
        return null;
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        let sessionId;

        try {
            console.log(`[AskService] 🤖 Processing message: ${userPrompt.substring(0, 50)}...`);

            sessionId = await sessionRepository.getOrCreateActive('ask');
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);
            
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            console.log(`[AskService] Using model: ${modelInfo.model} for provider: ${modelInfo.provider}`);

            const screenshotResult = await captureScreenshot({ quality: 'medium' });
            const screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;

            // PRIORITY 1: Get live transcript context (completely overrides everything if available)
            let liveTranscriptContext = null;
            let listenSessionId = null;
            let lastTranscriptCount = 0;
            try {
                const transcriptResult = await this._getLiveTranscriptContext(sessionId);
                if (transcriptResult) {
                    liveTranscriptContext = transcriptResult.context;
                    listenSessionId = transcriptResult.sessionId;
                    // Get transcript count for polling
                    const transcripts = await sttRepository.getAllTranscriptsBySessionId(listenSessionId);
                    lastTranscriptCount = transcripts ? transcripts.length : 0;
                }
            } catch (error) {
                console.warn('[AskService] Failed to get live transcript context:', error);
            }

            // PRIORITY 2: Get read content (only if no live transcripts)
            let readContent = null;
            let useReadContent = false;
            let readTextContent = '';
            if (!liveTranscriptContext) {
                try {
                    readContent = await readRepository.getLatestBySessionId(sessionId);
                } catch (error) {
                    console.warn('[AskService] Failed to get read content:', error);
                }

                // Check if read content is recent (within last 5 minutes)
                if (readContent && readContent.html_content) {
                    const now = Math.floor(Date.now() / 1000);
                    const readTime = readContent.read_at || readContent.created_at;
                    const timeDiff = now - readTime;
                    
                    // Use read content if it's less than 5 minutes old
                    if (timeDiff < 300) {
                        useReadContent = true;
                        // Extract text from HTML (simple approach - remove tags)
                        readTextContent = readContent.html_content
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 50000); // Limit to 50k chars for better context
                        
                        console.log(`[AskService] Using read content from ${readContent.url} (${readTextContent.length} chars)`);
                    }
                }
            }

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // Build context string - prioritize live transcripts, then read content, then conversation history
            let contextString = conversationHistory;
            if (liveTranscriptContext) {
                contextString = `Live Conversation Transcript:\n${liveTranscriptContext}`;
            } else if (useReadContent) {
                contextString = `Chrome Tab Content (from ${readContent.url || 'current tab'}):\n${readTextContent}\n\n${conversationHistory}`;
            }

            let systemPrompt = getSystemPrompt('pickle_glass_analysis', contextString, false);

            // Build user message - prioritize live transcripts, then read content, then normal format
            const userMessageContent = [];
            
            if (liveTranscriptContext) {
                // Add live transcript context prominently in user message
                // Limit to last 30k chars to prevent token overflow
                const truncatedTranscript = liveTranscriptContext.length > 30000 
                    ? liveTranscriptContext.substring(liveTranscriptContext.length - 30000)
                    : liveTranscriptContext;
                
                userMessageContent.push({
                    type: 'text',
                    text: `Live Conversation Transcript:\n\n${truncatedTranscript}\n\n---\n\nUser Request: ${userPrompt.trim()}`
                });
                console.log('[AskService] Using live transcript context in user message');
            } else if (useReadContent) {
                // Add read content as text in user message (more prominent than system prompt)
                userMessageContent.push({
                    type: 'text',
                    text: `Context from Chrome tab (${readContent.url || 'current tab'}):\n\n${readTextContent.substring(0, 30000)}\n\n---\n\nUser Request: ${userPrompt.trim()}`
                });
            } else {
                // No special context, use normal format
                userMessageContent.push({
                    type: 'text',
                    text: `User Request: ${userPrompt.trim()}`
                });
            }

            // Only include screenshot if we don't have live transcripts or read content
            if (!liveTranscriptContext && !useReadContent && screenshotBase64) {
                userMessageContent.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                });
            } else if (liveTranscriptContext || useReadContent) {
                console.log('[AskService] Skipping screenshot - using transcript/read content instead');
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: userMessageContent,
                },
            ];
            
            // Poll for new transcripts if we're using live transcript context
            // This ensures we have the latest context before sending
            if (liveTranscriptContext && listenSessionId) {
                console.log('[AskService] Polling for new transcripts before sending request...');
                const newTranscriptContext = await this._pollForNewTranscripts(listenSessionId, lastTranscriptCount, 5, 300);
                if (newTranscriptContext) {
                    // Append new transcripts to existing context
                    liveTranscriptContext += '\n' + newTranscriptContext;
                    // Update the user message with latest context
                    const truncatedTranscript = liveTranscriptContext.length > 30000 
                        ? liveTranscriptContext.substring(liveTranscriptContext.length - 30000)
                        : liveTranscriptContext;
                    userMessageContent[0] = {
                        type: 'text',
                        text: `Live Conversation Transcript:\n\n${truncatedTranscript}\n\n---\n\nUser Request: ${userPrompt.trim()}`
                    };
                    // Update system prompt context too
                    contextString = `Live Conversation Transcript:\n${liveTranscriptContext}`;
                    const systemPrompt = getSystemPrompt('pickle_glass_analysis', contextString, false);
                    messages[0] = { role: 'system', content: systemPrompt };
                    console.log('[AskService] Updated context with new transcripts');
                }
            }

            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });

            try {
                const response = await streamingLLM.streamChat(messages);
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error("[AskService] Ask window is not available to send stream to.");
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => { /* 이미 취소된 경우의 오류는 무시 */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                return { success: true };

            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);
                    
                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error("[AskService] Ask window is not available for fallback response.");
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            }
                        } catch (error) {
                        }
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch(dbError) {
                    console.error("[AskService] DB: Failed to save assistant response after stream ended:", dbError);
                }
            }
        }
    }

    /**
     * 멀티모달 관련 에러인지 판단
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

}

const askService = new AskService();

module.exports = askService;