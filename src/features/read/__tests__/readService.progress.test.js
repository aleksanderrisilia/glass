const readService = require('../readService');
const pdfService = require('../pdfService');
const sessionRepository = require('../../common/repositories/session');
const readRepository = require('../repositories');

// Mock dependencies
jest.mock('../pdfService');
jest.mock('../../common/repositories/session');
jest.mock('../repositories');

describe('ReadService - Progress and Loading State', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Progress Reporting', () => {
        it('should send progress updates to renderer', async () => {
            const mockSessionId = 'session-123';
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);

            const progressUpdates = [];
            const sendToRendererSpy = jest.spyOn(readService, 'sendToRenderer');
            sendToRendererSpy.mockImplementation((channel, data) => {
                if (channel === 'read-progress') {
                    progressUpdates.push(data);
                }
            });

            pdfService.extractTextFromPDF.mockImplementation(async (filePath, options) => {
                // Simulate progress updates
                if (options && options.onProgress) {
                    options.onProgress({ currentPage: 1, totalPages: 5, progress: 20, status: 'Processing...' });
                    options.onProgress({ currentPage: 3, totalPages: 5, progress: 60, status: 'Processing...' });
                    options.onProgress({ currentPage: 5, totalPages: 5, progress: 100, status: 'Completed' });
                }
                return {
                    success: true,
                    text: 'Transcribed text',
                    method: 'llm-transcription',
                    pageCount: 5
                };
            });

            readRepository.create.mockResolvedValue({
                id: 'read-123',
                session_id: mockSessionId
            });

            await readService.readPDF('test.pdf');

            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[0]).toHaveProperty('currentPage');
            expect(progressUpdates[0]).toHaveProperty('totalPages');
            expect(progressUpdates[0]).toHaveProperty('progress');
            expect(progressUpdates[0]).toHaveProperty('status');
        });

        it('should maintain loading state until transcription completes', async () => {
            const mockSessionId = 'session-123';
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);

            let transcriptionStarted = false;
            let transcriptionCompleted = false;

            pdfService.extractTextFromPDF.mockImplementation(async (filePath, options) => {
                transcriptionStarted = true;
                // Simulate async transcription
                await new Promise(resolve => setTimeout(resolve, 100));
                transcriptionCompleted = true;
                return {
                    success: true,
                    text: 'Transcribed',
                    method: 'llm-transcription'
                };
            });

            readRepository.create.mockResolvedValue({ id: 'read-123' });

            const readPromise = readService.readPDF('test.pdf');

            // At this point, transcription should be in progress
            expect(transcriptionStarted).toBe(true);
            expect(transcriptionCompleted).toBe(false);

            await readPromise;

            // Now transcription should be complete
            expect(transcriptionCompleted).toBe(true);
        });
    });

    describe('Error Handling with Progress', () => {
        it('should stop progress and show error on failure', async () => {
            const mockSessionId = 'session-123';
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);

            const errorUpdates = [];
            const sendToRendererSpy = jest.spyOn(readService, 'sendToRenderer');
            sendToRendererSpy.mockImplementation((channel, data) => {
                if (channel === 'read-error') {
                    errorUpdates.push(data);
                }
            });

            pdfService.extractTextFromPDF.mockResolvedValue({
                success: false,
                error: 'LLM transcription failed: API error'
            });

            const result = await readService.readPDF('test.pdf');

            expect(result.success).toBe(false);
            expect(errorUpdates.length).toBeGreaterThan(0);
            expect(errorUpdates[0].error).toContain('LLM transcription failed');
        });
    });

    describe('Completion Handling', () => {
        it('should send completion event after successful transcription', async () => {
            const mockSessionId = 'session-123';
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);

            const completionEvents = [];
            const sendToRendererSpy = jest.spyOn(readService, 'sendToRenderer');
            sendToRendererSpy.mockImplementation((channel, data) => {
                if (channel === 'read-complete') {
                    completionEvents.push(data);
                }
            });

            pdfService.extractTextFromPDF.mockResolvedValue({
                success: true,
                text: 'Transcribed text',
                method: 'llm-transcription',
                pageCount: 5
            });

            readRepository.create.mockResolvedValue({
                id: 'read-123',
                session_id: mockSessionId
            });

            await readService.readPDF('test.pdf');

            expect(completionEvents.length).toBeGreaterThan(0);
            expect(completionEvents[0].success).toBe(true);
            expect(completionEvents[0]).toHaveProperty('contentLength');
            expect(completionEvents[0].method).toBe('llm-transcription');
        });
    });
});

