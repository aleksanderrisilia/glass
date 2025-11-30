const fs = require('fs').promises;
const path = require('path');

class WordService {
    constructor() {
        this.memoryCache = new Map();
        this.cacheMaxSize = 10;
        console.log('[WordService] Service instance created.');
    }

    /**
     * Extract text from Word document (.docx)
     * Simple text extraction from DOCX files
     * @param {string} filePath - Path to Word document file
     * @param {Object} options - Options for extraction
     * @returns {Promise<{success: boolean, text?: string, error?: string, method?: string}>}
     */
    async extractTextFromWord(filePath, options = {}) {
        try {
            console.log(`[WordService] Extracting text from Word document: ${filePath}`);
            
            // Check memory cache first
            const cacheKey = `${filePath}:${(await fs.stat(filePath)).mtime.getTime()}`;
            if (this.memoryCache.has(cacheKey)) {
                console.log('[WordService] Returning cached Word document content');
                return this.memoryCache.get(cacheKey);
            }
            
            // Check file extension
            const ext = path.extname(filePath).toLowerCase();
            if (ext !== '.docx') {
                return {
                    success: false,
                    error: 'Only .docx files are supported. Please use a Word document (.docx) file.'
                };
            }

            // Report progress
            if (options.onProgress) {
                options.onProgress({
                    currentPage: 1,
                    totalPages: 1,
                    progress: 10,
                    status: 'Extracting text from Word document...'
                });
            }

            // Extract text using mammoth (simple DOCX text extraction)
            const extractedText = await this.extractTextFromDocx(filePath);

            if (options.onProgress) {
                options.onProgress({
                    currentPage: 1,
                    totalPages: 1,
                    progress: 100,
                    status: 'Text extraction completed'
                });
            }

            if (!extractedText || extractedText.trim().length === 0) {
                return {
                    success: false,
                    error: 'No text could be extracted from the Word document. It may be empty.'
                };
            }

            const result = {
                success: true,
                text: extractedText,
                method: 'text-extraction',
                note: 'Text extracted from Word document'
            };

            // Cache the result
            this.cacheResult(cacheKey, result);
            return result;
            
        } catch (error) {
            console.error('[WordService] Error extracting text from Word document:', error);
            return {
                success: false,
                error: `Text extraction failed: ${error.message}`
            };
        }
    }

    /**
     * Extract text from DOCX file
     * @param {string} filePath - Path to DOCX file
     * @returns {Promise<string>} Extracted text
     */
    async extractTextFromDocx(filePath) {
        try {
            // Try to use mammoth library if available
            let mammoth;
            try {
                mammoth = require('mammoth');
            } catch (e) {
                // Fallback: try to extract text using a simple ZIP-based approach
                return await this.extractTextFromDocxSimple(filePath);
            }

            // Read file buffer
            const dataBuffer = await fs.readFile(filePath);
            
            // Extract text using mammoth
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            
            return result.value.trim();
            
        } catch (error) {
            console.error('[WordService] Error extracting text with mammoth:', error);
            // Fallback to simple extraction
            return await this.extractTextFromDocxSimple(filePath);
        }
    }

    /**
     * Simple DOCX text extraction using ZIP-based approach
     * DOCX files are ZIP archives containing XML files
     * @param {string} filePath - Path to DOCX file
     * @returns {Promise<string>} Extracted text
     */
    async extractTextFromDocxSimple(filePath) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(filePath);
            
            // DOCX files contain document.xml with the main content
            const documentXml = zip.readAsText('word/document.xml');
            
            // Extract text from XML (simple regex-based extraction)
            // Remove XML tags and decode entities
            let text = documentXml
                .replace(/<[^>]+>/g, ' ') // Remove XML tags
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
            
            return text;
            
        } catch (error) {
            console.error('[WordService] Error in simple DOCX extraction:', error);
            throw new Error(`Failed to extract text from Word document: ${error.message}`);
        }
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

module.exports = new WordService();

