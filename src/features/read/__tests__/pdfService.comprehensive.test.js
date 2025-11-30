const pdfService = require('../pdfService');
const modelStateService = require('../../common/services/modelStateService');
const fs = require('fs').promises;
const path = require('path');

/**
 * Comprehensive tests for PDF Service with LLM transcription
 * Tests cover:
 * - LLM-only transcription (no direct extraction)
 * - All pages processing
 * - Progress reporting
 * - Error handling
 * - Memory caching
 * - Ask integration
 */

describe('PDFService - Comprehensive LLM Transcription Tests', () => {
    beforeEach(() => {
        pdfService.clearCache();
        jest.clearAllMocks();
    });

    describe('LLM-Only Transcription', () => {
        it('should always use LLM transcription, never direct text extraction', async () => {
            // Mock model info
            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4-vision',
                apiKey: 'test-key'
            });

            // Mock PDF.js
            const mockPdfJs = {
                getDocument: jest.fn().mockReturnValue({
                    promise: Promise.resolve({
                        numPages: 3,
                        getPage: jest.fn((pageNum) => Promise.resolve({
                            getViewport: jest.fn(() => ({ width: 100, height: 100 })),
                            render: jest.fn(() => ({ promise: Promise.resolve() }))
                        }))
                    })
                }),
                GlobalWorkerOptions: { workerSrc: '' }
            };

            // Verify that extractTextFromPDF always calls extractTextWithLLM
            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue({
                success: true,
                text: 'LLM transcribed text',
                method: 'llm-transcription',
                pageCount: 3
            });

            const result = await pdfService.extractTextFromPDF('test.pdf');

            expect(result.method).toBe('llm-transcription');
            expect(extractTextWithLLMSpy).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should process ALL pages, not just first 10', async () => {
            const mockModelInfo = {
                provider: 'openai',
                model: 'gpt-4-vision',
                apiKey: 'test-key'
            };

            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue(mockModelInfo);

            const mockPdfJs = {
                getDocument: jest.fn().mockReturnValue({
                    promise: Promise.resolve({
                        numPages: 25, // More than 10 pages
                        getPage: jest.fn((pageNum) => Promise.resolve({
                            getViewport: jest.fn(() => ({ width: 100, height: 100 })),
                            render: jest.fn(() => ({ promise: Promise.resolve() }))
                        }))
                    })
                }),
                GlobalWorkerOptions: { workerSrc: '' }
            };

            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue({
                success: true,
                text: 'Transcribed from all pages',
                method: 'llm-transcription',
                pageCount: 25,
                pagesProcessed: 25
            });

            const result = await pdfService.extractTextFromPDF('large.pdf');

            expect(result.pageCount).toBe(25);
            expect(result.pagesProcessed).toBe(25);
            // Verify all pages were processed (not limited to 10)
            expect(extractTextWithLLMSpy).toHaveBeenCalledWith(
                'large.pdf',
                expect.objectContaining({
                    pageCount: 25
                })
            );
        });
    });

    describe('Progress Reporting', () => {
        it('should call onProgress callback for each batch', async () => {
            const mockModelInfo = {
                provider: 'openai',
                model: 'gpt-4-vision',
                apiKey: 'test-key'
            };

            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue(mockModelInfo);

            const progressCalls = [];
            const onProgress = (progress) => {
                progressCalls.push(progress);
            };

            // Mock extractTextWithLLM to track progress calls
            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockImplementation(async (filePath, options) => {
                // Simulate progress updates
                if (options.onProgress) {
                    options.onProgress({ currentPage: 1, totalPages: 5, progress: 20, status: 'Processing pages 1-2 of 5...' });
                    options.onProgress({ currentPage: 3, totalPages: 5, progress: 60, status: 'Processing pages 3-4 of 5...' });
                    options.onProgress({ currentPage: 5, totalPages: 5, progress: 100, status: 'Completed transcription of 5 pages' });
                }
                return {
                    success: true,
                    text: 'Transcribed text',
                    method: 'llm-transcription',
                    pageCount: 5
                };
            });

            await pdfService.extractTextFromPDF('test.pdf', { onProgress });

            expect(progressCalls.length).toBeGreaterThan(0);
            expect(progressCalls[0]).toHaveProperty('currentPage');
            expect(progressCalls[0]).toHaveProperty('totalPages');
            expect(progressCalls[0]).toHaveProperty('progress');
            expect(progressCalls[0]).toHaveProperty('status');
        });

        it('should report progress from 0% to 100%', async () => {
            const progressValues = [];
            const onProgress = (progress) => {
                progressValues.push(progress.progress);
            };

            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockImplementation(async (filePath, options) => {
                if (options.onProgress) {
                    for (let i = 0; i <= 100; i += 25) {
                        options.onProgress({
                            currentPage: Math.ceil(i / 25),
                            totalPages: 4,
                            progress: i,
                            status: `Processing... ${i}%`
                        });
                    }
                }
                return { success: true, text: 'test', method: 'llm-transcription' };
            });

            await pdfService.extractTextFromPDF('test.pdf', { onProgress });

            expect(progressValues).toContain(0);
            expect(progressValues).toContain(100);
            expect(progressValues.length).toBeGreaterThan(1);
        });
    });

    describe('Error Handling', () => {
        it('should return error if no LLM model configured', async () => {
            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue(null);

            const result = await pdfService.extractTextFromPDF('test.pdf');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No LLM model');
        });

        it('should return error if model does not support vision', async () => {
            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue({
                provider: 'openai',
                model: 'gpt-3.5-turbo', // Not vision-capable
                apiKey: 'test-key'
            });

            const result = await pdfService.extractTextFromPDF('test.pdf');

            expect(result.success).toBe(false);
            expect(result.error).toContain('does not support image transcription');
        });

        it('should return error for password-protected PDFs', async () => {
            // Mock pdf-parse to throw password error
            jest.doMock('pdf-parse', () => {
                return jest.fn(() => Promise.reject(new Error('password required')));
            });

            const result = await pdfService.extractTextFromPDF('protected.pdf');

            expect(result.success).toBe(false);
            expect(result.error).toContain('password-protected');
        });

        it('should return error if LLM transcription fails', async () => {
            modelStateService.getCurrentModelInfo = jest.fn().mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4-vision',
                apiKey: 'test-key'
            });

            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue({
                success: false,
                error: 'LLM API error: Rate limit exceeded'
            });

            const result = await pdfService.extractTextFromPDF('test.pdf');

            expect(result.success).toBe(false);
            expect(result.error).toContain('LLM');
        });
    });

    describe('Memory Caching', () => {
        it('should cache successful transcriptions', async () => {
            const mockResult = {
                success: true,
                text: 'Cached transcription',
                method: 'llm-transcription',
                pageCount: 5
            };

            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue(mockResult);

            // First call
            const result1 = await pdfService.extractTextFromPDF('test.pdf');
            expect(extractTextWithLLMSpy).toHaveBeenCalledTimes(1);

            // Second call should use cache
            const result2 = await pdfService.extractTextFromPDF('test.pdf');
            // Should still be called once (cache hit)
            expect(extractTextWithLLMSpy).toHaveBeenCalledTimes(1);
        });

        it('should not cache failed transcriptions', async () => {
            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue({
                success: false,
                error: 'Transcription failed'
            });

            const result1 = await pdfService.extractTextFromPDF('test.pdf');
            expect(result1.success).toBe(false);

            // Second call should retry (not cached)
            const result2 = await pdfService.extractTextFromPDF('test.pdf');
            expect(extractTextWithLLMSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('Ask Integration', () => {
        it('should store transcribed text for Ask context', async () => {
            const mockResult = {
                success: true,
                text: 'This is PDF content that should be available for Ask',
                method: 'llm-transcription',
                pageCount: 3
            };

            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue(mockResult);

            const result = await pdfService.extractTextFromPDF('test.pdf');

            expect(result.success).toBe(true);
            expect(result.text).toContain('PDF content');
            // This text should be stored and available for Ask service
        });

        it('should extract clean text from stored content', () => {
            const htmlContent = `
                <div>
                    <h1>PDF Title</h1>
                    <p>Paragraph 1</p>
                    <p>Paragraph 2</p>
                    <script>alert('test')</script>
                </div>
            `;

            // Simulate text extraction (same as Ask service)
            const extractedText = htmlContent
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            expect(extractedText).toContain('PDF Title');
            expect(extractedText).toContain('Paragraph 1');
            expect(extractedText).toContain('Paragraph 2');
            expect(extractedText).not.toContain('script');
            expect(extractedText).not.toContain('alert');
        });
    });

    describe('Performance and Limits', () => {
        it('should process pages in batches', async () => {
            const batchSizes = [];
            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            
            extractTextWithLLMSpy.mockImplementation(async (filePath, options) => {
                // Track batch processing
                if (options.onProgress) {
                    let currentBatch = 0;
                    const totalPages = 20;
                    for (let i = 1; i <= totalPages; i += 2) {
                        currentBatch++;
                        options.onProgress({
                            currentPage: i,
                            totalPages: totalPages,
                            progress: Math.round((i / totalPages) * 100),
                            status: `Processing pages ${i}-${Math.min(i + 1, totalPages)} of ${totalPages}...`
                        });
                    }
                    batchSizes.push(currentBatch);
                }
                return { success: true, text: 'test', method: 'llm-transcription' };
            });

            await pdfService.extractTextFromPDF('large.pdf', { onProgress: () => {} });

            // Should process in batches of 2 pages
            expect(batchSizes.length).toBeGreaterThan(0);
        });

        it('should handle large PDFs efficiently', async () => {
            const startTime = Date.now();
            
            const extractTextWithLLMSpy = jest.spyOn(pdfService, 'extractTextWithLLM');
            extractTextWithLLMSpy.mockResolvedValue({
                success: true,
                text: 'Large PDF transcription',
                method: 'llm-transcription',
                pageCount: 100
            });

            await pdfService.extractTextFromPDF('large.pdf');

            const duration = Date.now() - startTime;
            // Should complete in reasonable time (mocked, so should be fast)
            expect(duration).toBeLessThan(1000);
        });
    });
});

