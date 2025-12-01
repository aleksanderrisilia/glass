const AskService = require('../askService');
const listenService = require('../../listen/listenService');
const sttRepository = require('../../listen/stt/repositories');
const readRepository = require('../../read/repositories');
const sessionRepository = require('../../common/repositories/session');
const askRepository = require('../repositories');

// Mock dependencies
jest.mock('../../listen/listenService');
jest.mock('../../listen/stt/repositories');
jest.mock('../../read/repositories');
jest.mock('../../common/repositories/session');
jest.mock('../repositories');
jest.mock('../../common/services/modelStateService');
jest.mock('../../common/ai/factory');
jest.mock('../../window/windowManager');
jest.mock('../../bridge/internalBridge');

describe('Live Transcript Integration', () => {
    let askService;

    beforeEach(() => {
        askService = new AskService();
        jest.clearAllMocks();
    });

    describe('sendMessage with live transcripts', () => {
        test('should use live transcripts when listening is active', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockAskSessionId = 'ask-session-456';
            const mockTranscripts = [
                {
                    id: '1',
                    session_id: mockListenSessionId,
                    start_at: Math.floor(Date.now() / 1000) - 100,
                    speaker: 'me',
                    text: 'What is the budget for Q4?'
                },
                {
                    id: '2',
                    session_id: mockListenSessionId,
                    start_at: Math.floor(Date.now() / 1000) - 50,
                    speaker: 'them',
                    text: 'The Q4 budget is $2.5 million.'
                }
            ];

            // Setup mocks
            sessionRepository.getOrCreateActive.mockResolvedValue(mockAskSessionId);
            askRepository.addAiMessage.mockResolvedValue({ id: 'msg-1' });
            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(true);
            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(mockTranscripts);
            readRepository.getLatestBySessionId.mockResolvedValue(null);

            // Mock model info
            const modelStateService = require('../../common/services/modelStateService');
            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });

            // Mock streaming LLM
            const { createStreamingLLM } = require('../../common/ai/factory');
            const mockStream = {
                body: {
                    getReader: jest.fn().mockReturnValue({
                        read: jest.fn().mockResolvedValue({ done: true, value: null })
                    })
                }
            };
            createStreamingLLM.mockReturnValue({
                streamChat: jest.fn().mockResolvedValue(mockStream)
            });

            // Mock window
            const windowManager = require('../../window/windowManager');
            const mockWindow = {
                isDestroyed: jest.fn().mockReturnValue(false),
                webContents: {
                    send: jest.fn()
                }
            };
            windowManager.windowPool = new Map([['ask', mockWindow]]);

            // Call sendMessage
            await askService.sendMessage('What did they say about the budget?', []);

            // Verify transcripts were fetched
            expect(sttRepository.getAllTranscriptsBySessionId).toHaveBeenCalledWith(mockListenSessionId);
            
            // Verify read content was NOT used (transcripts override)
            expect(readRepository.getLatestBySessionId).not.toHaveBeenCalled();
        });

        test('should fall back to read content when no transcripts exist', async () => {
            const mockAskSessionId = 'ask-session-456';
            const mockReadContent = {
                id: 'read-1',
                session_id: mockAskSessionId,
                html_content: '<html><body>Test content</body></html>',
                read_at: Math.floor(Date.now() / 1000) - 60,
                url: 'https://example.com'
            };

            // Setup mocks
            sessionRepository.getOrCreateActive.mockResolvedValue(mockAskSessionId);
            askRepository.addAiMessage.mockResolvedValue({ id: 'msg-1' });
            listenService.getCurrentSessionId.mockReturnValue(null); // No active listen session
            readRepository.getLatestBySessionId.mockResolvedValue(mockReadContent);

            // Mock model info
            const modelStateService = require('../../common/services/modelStateService');
            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });

            // Mock streaming LLM
            const { createStreamingLLM } = require('../../common/ai/factory');
            const mockStream = {
                body: {
                    getReader: jest.fn().mockReturnValue({
                        read: jest.fn().mockResolvedValue({ done: true, value: null })
                    })
                }
            };
            createStreamingLLM.mockReturnValue({
                streamChat: jest.fn().mockResolvedValue(mockStream)
            });

            // Mock window
            const windowManager = require('../../window/windowManager');
            const mockWindow = {
                isDestroyed: jest.fn().mockReturnValue(false),
                webContents: {
                    send: jest.fn()
                }
            };
            windowManager.windowPool = new Map([['ask', mockWindow]]);

            // Call sendMessage
            await askService.sendMessage('What is on this page?', []);

            // Verify read content was fetched
            expect(readRepository.getLatestBySessionId).toHaveBeenCalledWith(mockAskSessionId);
            
            // Verify transcripts were NOT fetched
            expect(sttRepository.getAllTranscriptsBySessionId).not.toHaveBeenCalled();
        });

        test('should use read content when listening stopped and read was triggered', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockAskSessionId = 'ask-session-456';
            const mockReadContent = {
                id: 'read-1',
                session_id: mockAskSessionId,
                html_content: '<html><body>New content from read</body></html>',
                read_at: Math.floor(Date.now() / 1000) - 30, // Recent (30 seconds ago)
                url: 'https://example.com'
            };
            const mockTranscripts = [
                {
                    id: '1',
                    session_id: mockListenSessionId,
                    start_at: Math.floor(Date.now() / 1000) - 200,
                    speaker: 'me',
                    text: 'Old transcript'
                }
            ];

            // Setup mocks
            sessionRepository.getOrCreateActive.mockResolvedValue(mockAskSessionId);
            askRepository.addAiMessage.mockResolvedValue({ id: 'msg-1' });
            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(false); // Listening stopped
            readRepository.getLatestBySessionId.mockResolvedValue(mockReadContent);
            sttRepository.getAllTranscriptsBySessionId.mockResolvedValue(mockTranscripts);

            // Mock model info
            const modelStateService = require('../../common/services/modelStateService');
            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });

            // Mock streaming LLM
            const { createStreamingLLM } = require('../../common/ai/factory');
            const mockStream = {
                body: {
                    getReader: jest.fn().mockReturnValue({
                        read: jest.fn().mockResolvedValue({ done: true, value: null })
                    })
                }
            };
            createStreamingLLM.mockReturnValue({
                streamChat: jest.fn().mockResolvedValue(mockStream)
            });

            // Mock window
            const windowManager = require('../../window/windowManager');
            const mockWindow = {
                isDestroyed: jest.fn().mockReturnValue(false),
                webContents: {
                    send: jest.fn()
                }
            };
            windowManager.windowPool = new Map([['ask', mockWindow]]);

            // Call sendMessage
            await askService.sendMessage('What is on this page?', []);

            // Verify read content was checked (and should override transcripts)
            expect(readRepository.getLatestBySessionId).toHaveBeenCalledWith(mockAskSessionId);
            
            // Transcripts should be checked but read content should take priority
            // (The implementation returns null from _getLiveTranscriptContext when read overrides)
        });

        test('should poll for new transcripts before sending request', async () => {
            const mockListenSessionId = 'listen-session-123';
            const mockAskSessionId = 'ask-session-456';
            const initialTranscripts = [
                {
                    id: '1',
                    session_id: mockListenSessionId,
                    start_at: Math.floor(Date.now() / 1000) - 100,
                    speaker: 'me',
                    text: 'Initial message'
                }
            ];
            const updatedTranscripts = [
                ...initialTranscripts,
                {
                    id: '2',
                    session_id: mockListenSessionId,
                    start_at: Math.floor(Date.now() / 1000) - 10,
                    speaker: 'them',
                    text: 'New message arrived'
                }
            ];

            // Setup mocks
            sessionRepository.getOrCreateActive.mockResolvedValue(mockAskSessionId);
            askRepository.addAiMessage.mockResolvedValue({ id: 'msg-1' });
            listenService.getCurrentSessionId.mockReturnValue(mockListenSessionId);
            listenService.isSessionActive.mockReturnValue(true);
            
            // First call returns initial, subsequent calls return updated
            sttRepository.getAllTranscriptsBySessionId
                .mockResolvedValueOnce(initialTranscripts) // Initial fetch
                .mockResolvedValueOnce(initialTranscripts) // Count check
                .mockResolvedValueOnce(updatedTranscripts) // Poll check
                .mockResolvedValueOnce(updatedTranscripts); // Final check

            readRepository.getLatestBySessionId.mockResolvedValue(null);

            // Mock model info
            const modelStateService = require('../../common/services/modelStateService');
            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });

            // Mock streaming LLM
            const { createStreamingLLM } = require('../../common/ai/factory');
            const mockStream = {
                body: {
                    getReader: jest.fn().mockReturnValue({
                        read: jest.fn().mockResolvedValue({ done: true, value: null })
                    })
                }
            };
            createStreamingLLM.mockReturnValue({
                streamChat: jest.fn().mockResolvedValue(mockStream)
            });

            // Mock window
            const windowManager = require('../../window/windowManager');
            const mockWindow = {
                isDestroyed: jest.fn().mockReturnValue(false),
                webContents: {
                    send: jest.fn()
                }
            };
            windowManager.windowPool = new Map([['ask', mockWindow]]);

            // Call sendMessage
            await askService.sendMessage('What did they say?', []);

            // Verify polling occurred (multiple calls to getAllTranscriptsBySessionId)
            expect(sttRepository.getAllTranscriptsBySessionId).toHaveBeenCalledTimes(4);
        });
    });
});

