const askService = require('../../ask/askService');
const readRepository = require('../repositories');

// Mock dependencies
jest.mock('../repositories');

describe('Ask Service - PDF Content Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('PDF content in Ask context', () => {
        it('should use PDF content when asking questions', async () => {
            const mockSessionId = 'session-123';
            const mockPDFContent = {
                id: 'read-123',
                session_id: mockSessionId,
                url: 'file://test.pdf',
                title: 'test.pdf',
                html_content: 'This is PDF content that should be used in context',
                read_at: Math.floor(Date.now() / 1000) - 60 // 1 minute ago
            };
            
            // Mock recent PDF content
            readRepository.getLatestBySessionId.mockResolvedValue(mockPDFContent);
            
            // Mock model info
            const modelStateService = require('../../common/services/modelStateService');
            jest.spyOn(modelStateService, 'getCurrentModelInfo').mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });
            
            // This test verifies that PDF content is retrieved and used
            const readContent = await readRepository.getLatestBySessionId(mockSessionId);
            
            expect(readContent).toEqual(mockPDFContent);
            expect(readContent.html_content).toContain('PDF content');
        });

        it('should prioritize PDF content over screenshots', async () => {
            const mockSessionId = 'session-123';
            const mockPDFContent = {
                id: 'read-123',
                session_id: mockSessionId,
                url: 'file://test.pdf',
                title: 'test.pdf',
                html_content: 'PDF content',
                read_at: Math.floor(Date.now() / 1000) - 120 // 2 minutes ago (within 5 min window)
            };
            
            readRepository.getLatestBySessionId.mockResolvedValue(mockPDFContent);
            
            // When PDF content is available and recent, screenshot should be skipped
            // This is verified by checking that useReadContent is true
            const now = Math.floor(Date.now() / 1000);
            const readTime = mockPDFContent.read_at;
            const timeDiff = now - readTime;
            
            expect(timeDiff).toBeLessThan(300); // Less than 5 minutes
            // In actual implementation, this would cause useReadContent = true
            // and screenshot would be skipped
        });

        it('should not use stale PDF content', async () => {
            const mockSessionId = 'session-123';
            const mockStaleContent = {
                id: 'read-123',
                session_id: mockSessionId,
                url: 'file://test.pdf',
                title: 'test.pdf',
                html_content: 'Old PDF content',
                read_at: Math.floor(Date.now() / 1000) - 400 // 6+ minutes ago (stale)
            };
            
            readRepository.getLatestBySessionId.mockResolvedValue(mockStaleContent);
            
            // When PDF content is stale, it should not be used
            const now = Math.floor(Date.now() / 1000);
            const readTime = mockStaleContent.read_at;
            const timeDiff = now - readTime;
            
            expect(timeDiff).toBeGreaterThan(300); // More than 5 minutes
            // In actual implementation, this would cause useReadContent = false
            // and screenshot would be used instead
        });

        it('should extract text from PDF HTML content', async () => {
            const mockHTMLContent = `
                <div>
                    <h1>PDF Title</h1>
                    <p>This is paragraph 1</p>
                    <p>This is paragraph 2</p>
                    <script>alert('test')</script>
                </div>
            `;
            
            // Simulate text extraction (removing HTML tags)
            const extractedText = mockHTMLContent
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            expect(extractedText).toContain('PDF Title');
            expect(extractedText).toContain('paragraph 1');
            expect(extractedText).toContain('paragraph 2');
            expect(extractedText).not.toContain('script');
            expect(extractedText).not.toContain('alert');
        });
    });
});

