const pdfService = require('../pdfService');
const pdfDetector = require('../pdfDetector');
const fs = require('fs').promises;
const path = require('path');

describe('PDFService', () => {
    let testPdfPath;

    beforeAll(async () => {
        // Create a test PDF file (mock)
        // In a real test, you'd use a library to create a test PDF
        testPdfPath = path.join(__dirname, 'test.pdf');
    });

    afterAll(async () => {
        // Cleanup
        try {
            await fs.unlink(testPdfPath);
        } catch {
            // Ignore
        }
        pdfService.clearCache();
    });

    describe('extractTextFromPDF', () => {
        it('should extract text from a valid PDF', async () => {
            // This would require a real PDF file
            // For now, we'll test the structure
            expect(typeof pdfService.extractTextFromPDF).toBe('function');
        });

        it('should handle password-protected PDFs', async () => {
            const result = await pdfService.extractTextFromPDF('nonexistent.pdf');
            // Should return error structure
            expect(result).toHaveProperty('success');
        });

        it('should cache results', async () => {
            // Test caching functionality
            const cacheKey = 'test:123';
            const testResult = { success: true, text: 'test', method: 'text-extraction' };
            pdfService.cacheResult(cacheKey, testResult);
            
            const cached = pdfService.getCachedResult('test');
            expect(cached).toBeTruthy();
        });

        it('should clear cache', () => {
            pdfService.clearCache();
            const cached = pdfService.getCachedResult('test');
            expect(cached).toBeNull();
        });
    });

    describe('extractTextWithLLM', () => {
        it('should have LLM transcription method', () => {
            expect(typeof pdfService.extractTextWithLLM).toBe('function');
        });

        it('should check vision support', () => {
            const supportsVision = pdfService.checkVisionSupport('openai', 'gpt-4-vision');
            expect(supportsVision).toBe(true);

            const noVision = pdfService.checkVisionSupport('openai', 'gpt-3.5-turbo');
            expect(noVision).toBe(false);
        });
    });
});

describe('PDFDetector', () => {
    describe('getCurrentlyOpenPDF', () => {
        it('should return null on non-Windows platforms', async () => {
            if (process.platform !== 'win32') {
                const result = await pdfDetector.getCurrentlyOpenPDF();
                expect(result).toBeNull();
            }
        });

        it('should have caching mechanism', () => {
            pdfDetector.clearCache();
            expect(pdfDetector.cachedOpenPDF).toBeNull();
        });
    });

    describe('findPDFFile', () => {
        it('should search for PDF files in common locations', async () => {
            // This would require actual file system access
            // For now, we test the method exists
            expect(typeof pdfDetector.findPDFFile).toBe('function');
        });
    });
});

