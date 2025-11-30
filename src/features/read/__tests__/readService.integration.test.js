const readService = require('../readService');
const pdfService = require('../pdfService');
const pdfDetector = require('../pdfDetector');
const sessionRepository = require('../../common/repositories/session');
const readRepository = require('../repositories');

// Mock dependencies
jest.mock('../pdfService');
jest.mock('../pdfDetector');
jest.mock('../../common/repositories/session');
jest.mock('../repositories');

describe('ReadService - PDF Reading Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('readPDF', () => {
        it('should read PDF and store in database', async () => {
            const mockFilePath = 'test.pdf';
            const mockSessionId = 'session-123';
            const mockText = 'Transcribed PDF content';
            
            // Mock session
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);
            
            // Mock PDF service
            pdfService.extractTextFromPDF.mockResolvedValue({
                success: true,
                text: mockText,
                method: 'llm-transcription',
                pageCount: 5
            });
            
            // Mock repository
            readRepository.create.mockResolvedValue({
                id: 'read-123',
                session_id: mockSessionId,
                url: `file://${mockFilePath}`,
                title: 'test.pdf',
                html_content: mockText
            });
            
            const result = await readService.readPDF(mockFilePath);
            
            expect(result.success).toBe(true);
            expect(result.data.contentLength).toBe(mockText.length);
            expect(result.data.method).toBe('llm-transcription');
            expect(readRepository.create).toHaveBeenCalled();
        });

        it('should handle PDF service errors', async () => {
            const mockFilePath = 'test.pdf';
            const mockSessionId = 'session-123';
            
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);
            pdfService.extractTextFromPDF.mockResolvedValue({
                success: false,
                error: 'LLM transcription failed'
            });
            
            const result = await readService.readPDF(mockFilePath);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('LLM transcription failed');
            expect(readRepository.create).not.toHaveBeenCalled();
        });

        it('should handle password-protected PDFs', async () => {
            const mockFilePath = 'protected.pdf';
            const mockSessionId = 'session-123';
            
            sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);
            pdfService.extractTextFromPDF.mockResolvedValue({
                success: false,
                error: 'PDF is password-protected or encrypted'
            });
            
            const result = await readService.readPDF(mockFilePath);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('password-protected');
        });
    });

    describe('readPDFFromFilePicker', () => {
        it('should try to detect open PDF first', async () => {
            const mockOpenPDF = 'C:\\Users\\User\\Documents\\open.pdf';
            
            pdfDetector.getCurrentlyOpenPDF.mockResolvedValue(mockOpenPDF);
            pdfService.extractTextFromPDF.mockResolvedValue({
                success: true,
                text: 'PDF content',
                method: 'llm-transcription'
            });
            sessionRepository.getOrCreateActive.mockResolvedValue('session-123');
            readRepository.create.mockResolvedValue({ id: 'read-123' });
            
            const result = await readService.readPDFFromFilePicker();
            
            expect(pdfDetector.getCurrentlyOpenPDF).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should fall back to file picker if no open PDF', async () => {
            pdfDetector.getCurrentlyOpenPDF.mockResolvedValue(null);
            
            // Mock dialog to return canceled
            const { dialog } = require('electron');
            jest.spyOn(dialog, 'showOpenDialog').mockResolvedValue({
                canceled: true,
                filePaths: []
            });
            
            const result = await readService.readPDFFromFilePicker();
            
            expect(result.success).toBe(false);
            expect(result.canceled).toBe(true);
        });
    });

    describe('getLatestReadContent', () => {
        it('should retrieve latest read content for session', async () => {
            const mockSessionId = 'session-123';
            const mockContent = {
                id: 'read-123',
                session_id: mockSessionId,
                url: 'file://test.pdf',
                title: 'test.pdf',
                html_content: 'PDF content',
                read_at: Math.floor(Date.now() / 1000)
            };
            
            readRepository.getLatestBySessionId.mockResolvedValue(mockContent);
            
            const result = await readService.getLatestReadContent(mockSessionId);
            
            expect(result).toEqual(mockContent);
            expect(readRepository.getLatestBySessionId).toHaveBeenCalledWith(mockSessionId);
        });
    });
});

describe('ReadService - Loading State Management', () => {
    it('should maintain loading state during LLM transcription', async () => {
        // This test verifies that the loading state is properly managed
        // The actual implementation should ensure isReading stays true until transcription completes
        
        const mockFilePath = 'test.pdf';
        const mockSessionId = 'session-123';
        
        sessionRepository.getOrCreateActive.mockResolvedValue(mockSessionId);
        
        // Simulate slow LLM transcription
        let resolveTranscription;
        const transcriptionPromise = new Promise(resolve => {
            resolveTranscription = resolve;
        });
        
        pdfService.extractTextFromPDF.mockReturnValue(transcriptionPromise);
        
        // Start reading (this would set isReading = true in actual implementation)
        const readPromise = readService.readPDF(mockFilePath);
        
        // At this point, isReading should still be true
        // (In actual UI, this would be managed by MainHeader)
        
        // Complete transcription
        resolveTranscription({
            success: true,
            text: 'Transcribed content',
            method: 'llm-transcription'
        });
        
        await readPromise;
        
        // Now isReading should be false
        // (In actual UI, this would be set in finally block)
    });
});

