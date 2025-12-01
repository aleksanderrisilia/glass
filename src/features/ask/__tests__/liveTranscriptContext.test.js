const AskService = require('../askService');
const sttRepository = require('../../listen/stt/repositories');
const readRepository = require('../../read/repositories');
const listenService = require('../../listen/listenService');

// Mock dependencies
jest.mock('../../listen/stt/repositories');
jest.mock('../../read/repositories');
jest.mock('../../listen/listenService');
jest.mock('../../common/repositories/session');
jest.mock('../repositories');
jest.mock('../../common/services/modelStateService');
jest.mock('../../common/ai/factory');
jest.mock('../../window/windowManager');
jest.mock('../../bridge/internalBridge');

describe('Live Transcript Context', () => {
    let askService;

    beforeEach(() => {
        askService = new AskService();
        jest.clearAllMocks();
    });

    describe('_formatTimestamp', () => {
        test('should format Unix timestamp to HH:MM:SS', () => {
            // Test with a known timestamp: 2024-01-15 14:30:45 UTC
            const timestamp = 1705329045; // Jan 15, 2024 14:30:45 UTC
            const formatted = askService._formatTimestamp(timestamp);
            
            // Should be in HH:MM:SS format
            expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        });

        test('should pad single digit hours, minutes, seconds', () => {
            // Test with timestamp that produces single digits
            const timestamp = 1705320000; // Some timestamp
            const formatted = askService._formatTimestamp(timestamp);
            const parts = formatted.split(':');
            
            expect(parts[0].length).toBe(2);
            expect(parts[1].length).toBe(2);
            expect(parts[2].length).toBe(2);
        });
    });

    describe('_formatTranscriptsForContext', () => {
        test('should format transcripts with timestamps and speaker labels', () => {
            const transcripts = [
                {
                    id: '1',
                    session_id: 'session1',
                    start_at: 1705329045,
                    speaker: 'me',
                    text: 'Hello, how are you?'
                },
                {
                    id: '2',
                    session_id: 'session1',
                    start_at: 1705329050,
                    speaker: 'them',
                    text: 'I am doing well, thank you!'
                }
            ];

            const formatted = askService._formatTranscriptsForContext(transcripts);
            
            expect(formatted).toContain('You:');
            expect(formatted).toContain('Speaker:');
            expect(formatted).toContain('Hello, how are you?');
            expect(formatted).toContain('I am doing well, thank you!');
            expect(formatted).toMatch(/\[\d{2}:\d{2}:\d{2}\]/); // Timestamp format
        });

        test('should return empty string for empty array', () => {
            const formatted = askService._formatTranscriptsForContext([]);
            expect(formatted).toBe('');
        });

        test('should handle null/undefined transcripts', () => {
            expect(askService._formatTranscriptsForContext(null)).toBe('');
            expect(askService._formatTranscriptsForContext(undefined)).toBe('');
        });

        test('should use created_at if start_at is missing', () => {
            const transcripts = [
                {
                    id: '1',
                    session_id: 'session1',
                    created_at: 1705329045,
                    speaker: 'me',
                    text: 'Test message'
                }
            ];

            const formatted = askService._formatTranscriptsForContext(transcripts);
            expect(formatted).toContain('You:');
            expect(formatted).toContain('Test message');
        });
    });

    describe('_getLiveTranscriptContext', () => {
        test('should return transcript context when listening session exists', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockTranscripts = [
                {
                    id: '1',
                    session_id: mockListenSessionId,
                    start_at: 1705329045,
                    speaker: 'me',
                    text: 'First message'
                },
                {
                    id: '2',
                    session_id: mockListenSessionId,
                    start_at: 1705329050,
                    speaker: 'them',
                    text: 'Second message'
                }
            ];

            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(true);
            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(mockTranscripts);

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).not.toBeNull();
            expect(result.context).toContain('You:');
            expect(result.context).toContain('Speaker:');
            expect(result.sessionId).toBe(mockListenSessionId);
            expect(sttRepository.getAllTranscriptsBySessionId).toHaveBeenCalledWith(mockListenSessionId);
        });

        test('should return null when no active listen session', async () => {
            listenService.getCurrentSessionId.mockReturnValue(null);

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).toBeNull();
            expect(sttRepository.getAllTranscriptsBySessionId).not.toHaveBeenCalled();
        });

        test('should return null when no transcripts exist', async () => {
            const mockListenSessionId = 'listen-session-123';
            
            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(true);
            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue([]);

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).toBeNull();
        });

        test('should return null when read content overrides (listening stopped + recent read)', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockReadContent = {
                id: 'read-1',
                session_id: 'ask-session-456',
                html_content: '<html>Test content</html>',
                read_at: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
                url: 'https://example.com'
            };

            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(false); // Listening stopped
            readRepository.getLatestBySessionId.mockResolvedValue(mockReadContent);

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).toBeNull(); // Should return null to allow read content to be used
            expect(sttRepository.getAllTranscriptsBySessionId).not.toHaveBeenCalled();
        });

        test('should return transcripts when read content is old (listening stopped but read is old)', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockTranscripts = [
                {
                    id: '1',
                    session_id: mockListenSessionId,
                    start_at: 1705329045,
                    speaker: 'me',
                    text: 'Test message'
                }
            ];
            const mockReadContent = {
                id: 'read-1',
                session_id: 'ask-session-456',
                html_content: '<html>Test content</html>',
                read_at: Math.floor(Date.now() / 1000) - 400, // 6+ minutes ago (old)
                url: 'https://example.com'
            };

            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(false); // Listening stopped
            readRepository.getLatestBySessionId.mockResolvedValue(mockReadContent);
            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(mockTranscripts);

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).not.toBeNull(); // Should return transcripts (read is too old)
            expect(result.sessionId).toBe(mockListenSessionId);
        });

        test('should handle errors gracefully', async () => {
            listenService.getCurrentSessionId.mockImplementation(() => {
                throw new Error('Service error');
            });

            const result = await askService._getLiveTranscriptContext('ask-session-456');

            expect(result).toBeNull();
        });
    });

    describe('_pollForNewTranscripts', () => {
        test('should return new transcripts when they arrive', async () => {
            const sessionId = 'listen-session-123';
            const initialTranscripts = [
                { id: '1', start_at: 1705329045, speaker: 'me', text: 'First' }
            ];
            const updatedTranscripts = [
                ...initialTranscripts,
                { id: '2', start_at: 1705329050, speaker: 'them', text: 'Second' }
            ];

            // First call returns initial, second call returns updated
            sttRepository.getAllTranscriptsBySessionId
                .mockResolvedValueOnce(initialTranscripts)
                .mockResolvedValueOnce(updatedTranscripts);

            const result = await askService._pollForNewTranscripts(sessionId, 1, 2, 100);

            expect(result).not.toBeNull();
            expect(result).toContain('Second');
        });

        test('should return null when no new transcripts arrive', async () => {
            const sessionId = 'listen-session-123';
            const transcripts = [
                { id: '1', start_at: 1705329045, speaker: 'me', text: 'First' }
            ];

            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

            const result = await askService._pollForNewTranscripts(sessionId, 1, 2, 100);

            expect(result).toBeNull();
        });

        test('should respect max polls limit', async () => {
            const sessionId = 'listen-session-123';
            const transcripts = [
                { id: '1', start_at: 1705329045, speaker: 'me', text: 'First' }
            ];

            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(transcripts);

            const startTime = Date.now();
            const result = await askService._pollForNewTranscripts(sessionId, 1, 2, 50);
            const duration = Date.now() - startTime;

            expect(result).toBeNull();
            // Should have polled max 2 times with 50ms interval = ~100ms
            expect(duration).toBeLessThan(200);
        });

        test('should handle errors during polling', async () => {
            const sessionId = 'listen-session-123';

            sttRepository.getAllTranscriptsBySessionId.mockRejectedValue(new Error('DB error'));

            const result = await askService._pollForNewTranscripts(sessionId, 1, 2, 50);

            expect(result).toBeNull();
        });
    });
});

