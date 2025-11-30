const fs = require('fs').promises;
const { createStreamingLLM } = require('../common/ai/factory');
const modelStateService = require('../common/services/modelStateService');

class PDFService {
    constructor() {
        this.memoryCache = new Map();
        this.cacheMaxSize = 10;
        console.log('[PDFService] Service instance created.');
    }

    /**
     * Extract text from PDF file using LLM transcription ONLY
     * Dead simple: Read PDF, send to LLM, get transcription, save text
     * @param {string} filePath - Path to PDF file
     * @param {Object} options - Options for extraction
     * @returns {Promise<{success: boolean, text?: string, error?: string, method?: string}>}
     */
    async extractTextFromPDF(filePath, options = {}) {
        try {
            console.log(`[PDFService] Reading PDF and sending to LLM: ${filePath}`);
            
            // Check memory cache first
            const cacheKey = `${filePath}:${(await fs.stat(filePath)).mtime.getTime()}`;
            if (this.memoryCache.has(cacheKey)) {
                console.log('[PDFService] Returning cached PDF content');
                return this.memoryCache.get(cacheKey);
            }
            
            // Read PDF file as base64
            const dataBuffer = await fs.readFile(filePath);
            const base64Pdf = dataBuffer.toString('base64');
            
            // Get Gemini model info specifically for PDF transcription
            const providerSettingsRepository = require('../common/repositories/providerSettings');
            const geminiSettings = await providerSettingsRepository.getByProvider('gemini');
            
            if (!geminiSettings || !geminiSettings.api_key) {
                return {
                    success: false,
                    error: 'No Gemini API key configured. Please configure a Gemini API key in settings to use PDF transcription.'
                };
            }

            // Use Gemini 2.5 Flash for PDF transcription (supports PDFs natively)
            const geminiModel = 'gemini-2.5-flash';
            const modelInfo = {
                provider: 'gemini',
                model: geminiModel,
                apiKey: geminiSettings.api_key
            };

            // Report progress
            if (options.onProgress) {
                options.onProgress({
                    currentPage: 1,
                    totalPages: 1,
                    progress: 10,
                    status: 'Sending PDF to LLM for transcription...'
                });
            }

            // Send PDF directly to LLM for transcription
            const transcribedText = await this.transcribePDFWithLLM(base64Pdf, modelInfo, options);

            if (options.onProgress) {
                options.onProgress({
                    currentPage: 1,
                    totalPages: 1,
                    progress: 100,
                    status: 'Transcription completed'
                });
            }

            if (!transcribedText || transcribedText.trim().length === 0) {
                return {
                    success: false,
                    error: 'No text could be transcribed from the PDF. It may be empty or contain only images without readable text.'
                };
            }

            const result = {
                success: true,
                text: transcribedText,
                method: 'llm-transcription',
                pageCount: 1,
                note: 'PDF transcribed using LLM'
            };

            // Cache the result
            this.cacheResult(cacheKey, result);
            return result;
            
        } catch (error) {
            console.error('[PDFService] Error transcribing PDF:', error);
            return {
                success: false,
                error: `LLM transcription failed: ${error.message}`
            };
        }
    }

    /**
     * Transcribe PDF directly using LLM
     * Sends PDF as base64 to LLM with transcription prompt
     * @param {string} base64Pdf - PDF file as base64 string
     * @param {Object} modelInfo - LLM model information
     * @param {Object} options - Options for transcription
     * @returns {Promise<string>} Transcribed text
     */
    async transcribePDFWithLLM(base64Pdf, modelInfo, options = {}) {
        try {
            console.log('[PDFService] Sending PDF to LLM for transcription...');
            
            // Create streaming LLM instance
            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.3,
                maxTokens: 4096,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });

            // Simple transcription prompt
            const prompt = `Please transcribe all text from this PDF document. Extract all visible text, maintaining the structure and layout as much as possible. Include headings, paragraphs, lists, tables, and any other text elements. Be thorough and accurate.`;

            // Prepare content for Gemini - Gemini supports PDFs directly
            // For Gemini, we send PDF as inlineData with mimeType application/pdf
            const content = [
                {
                    type: 'text',
                    text: prompt
                },
                {
                    type: 'image_url',
                    image_url: { 
                        url: `data:application/pdf;base64,${base64Pdf}` 
                    }
                }
            ];

            const messages = [
                {
                    role: 'user',
                    content: content
                }
            ];

            let transcribedText = '';
            const response = await streamingLLM.streamChat(messages);
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                                    const content = parsed.choices[0].delta.content;
                                    if (content) {
                                        transcribedText += content;
                                    }
                                }
                            } catch {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            }

            console.log(`[PDFService] LLM transcribed ${transcribedText.length} characters`);
            return transcribedText.trim();
            
        } catch (error) {
            console.error('[PDFService] Error transcribing PDF with LLM:', error);
            throw error;
        }
    }

    /**
     * Check if the model supports vision/multimodal
     */
    checkVisionSupport(provider, model) {
        const visionModels = {
            'openai': ['gpt-4-vision', 'gpt-4o', 'gpt-4-turbo'],
            'openai-glass': ['gpt-4-vision', 'gpt-4o', 'gpt-4-turbo'],
            'anthropic': ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet'],
            'google': ['gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash']
        };

        const providerModels = visionModels[provider] || [];
        return providerModels.some(vm => model.toLowerCase().includes(vm.toLowerCase()));
    }

    /**
     * Cache result in memory
     */
    cacheResult(key, result) {
        if (this.memoryCache.size >= this.cacheMaxSize) {
            const firstKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(firstKey);
        }
        this.memoryCache.set(key, result);
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.memoryCache.clear();
    }
}

module.exports = new PDFService();
