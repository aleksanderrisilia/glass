const MindmapService = require('../mindmapService');
const { createLLM } = require('../../../common/ai/factory');
const modelStateService = require('../../../common/services/modelStateService');

// Mock dependencies
jest.mock('../../../common/ai/factory');
jest.mock('../../../common/services/modelStateService');
jest.mock('../../summary/repositories', () => ({
    getSummaryBySessionId: jest.fn(),
    saveSummary: jest.fn()
}));

describe('MindmapService LLM Integration', () => {
    let mindmapService;
    let mockLLM;

    beforeEach(() => {
        mindmapService = new MindmapService();
        mindmapService.setSessionId('test-session-123');
        
        // Create mock LLM
        mockLLM = {
            chat: jest.fn()
        };
        
        createLLM.mockReturnValue(mockLLM);
        
        // Mock model state service
        modelStateService.getCurrentModelInfo.mockResolvedValue({
            provider: 'openai',
            model: 'gpt-4',
            apiKey: 'test-api-key'
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('generateMindmapUpdates with real LLM response formats', () => {
        it('should parse OpenAI-style response correctly', async () => {
            const mockResponse = {
                content: JSON.stringify({
                    nodes: [
                        { id: '1', label: 'Topic A', type: 'topic', level: 1, color: '#ff0000', size: 20 }
                    ],
                    edges: [
                        { id: 'e1', from: '1', to: '2', type: 'related', color: '#00ff00' }
                    ],
                    summary: 'Added Topic A'
                }),
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = {
                nodes: [],
                edges: [],
                version: 1
            };
            
            const newTranscripts = 'User: Hello, let\'s discuss Topic A';
            const recentConversation = 'User: Hello, let\'s discuss Topic A';
            
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                newTranscripts,
                recentConversation
            );
            
            expect(updates).toBeDefined();
            expect(Array.isArray(updates.nodes)).toBe(true);
            expect(Array.isArray(updates.edges)).toBe(true);
            expect(updates.nodes.length).toBe(1);
            expect(updates.edges.length).toBe(1);
        });

        it('should parse response with markdown code blocks', async () => {
            const jsonContent = JSON.stringify({
                nodes: [{ id: '1', label: 'Test', type: 'topic', level: 1, color: '#ff0000', size: 20 }],
                edges: [],
                summary: 'Test'
            });
            
            const mockResponse = {
                content: `Here is the mindmap:\n\n\`\`\`json\n${jsonContent}\n\`\`\``,
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            expect(updates).toBeDefined();
            expect(Array.isArray(updates.nodes)).toBe(true);
        });

        it('should parse Gemini-style response (response.text() format)', async () => {
            const jsonContent = JSON.stringify({
                nodes: [{ id: '1', label: 'Test', type: 'topic', level: 1, color: '#ff0000', size: 20 }],
                edges: [],
                summary: 'Test'
            });
            
            const mockResponse = {
                text: jsonContent,
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            expect(updates).toBeDefined();
            expect(Array.isArray(updates.nodes)).toBe(true);
        });

        it('should handle response with extra text before JSON', async () => {
            const jsonContent = JSON.stringify({
                nodes: [{ id: '1', label: 'Test', type: 'topic', level: 1, color: '#ff0000', size: 20 }],
                edges: [],
                summary: 'Test'
            });
            
            const mockResponse = {
                content: `I'll generate a mindmap for you:\n\n${jsonContent}\n\nThis represents the conversation structure.`,
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            expect(updates).toBeDefined();
            expect(Array.isArray(updates.nodes)).toBe(true);
        });

        it('should throw error when LLM returns no JSON', async () => {
            const mockResponse = {
                content: 'I cannot generate a mindmap at this time.',
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            
            await expect(
                mindmapService.generateMindmapUpdates(
                    existingMindmap,
                    'User: Test',
                    'User: Test'
                )
            ).rejects.toThrow('No JSON found in LLM response');
        });

        it('should throw error when LLM returns invalid JSON', async () => {
            const mockResponse = {
                content: '{"nodes": [{"id": "1", "label": "Test"}], "edges": [}', // Invalid JSON
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            
            await expect(
                mindmapService.generateMindmapUpdates(
                    existingMindmap,
                    'User: Test',
                    'User: Test'
                )
            ).rejects.toThrow('Failed to parse JSON');
        });

        it('should handle empty response gracefully', async () => {
            const mockResponse = {
                content: '',
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            
            await expect(
                mindmapService.generateMindmapUpdates(
                    existingMindmap,
                    'User: Test',
                    'User: Test'
                )
            ).rejects.toThrow('No JSON found in LLM response');
        });

        it('should validate and normalize response structure', async () => {
            const mockResponse = {
                content: JSON.stringify({
                    nodes: [{ id: '1', label: 'Test', type: 'topic', level: 1, color: '#ff0000', size: 20 }],
                    edges: [],
                    summary: 'Test'
                }),
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            // Should normalize to arrays even if missing
            expect(Array.isArray(updates.nodes)).toBe(true);
            expect(Array.isArray(updates.edges)).toBe(true);
        });
    });

    describe('LLM call verification', () => {
        it('should call LLM with correct system and user messages', async () => {
            const mockResponse = {
                content: JSON.stringify({ nodes: [], edges: [], summary: 'Test' }),
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            expect(mockLLM.chat).toHaveBeenCalledTimes(1);
            const callArgs = mockLLM.chat.mock.calls[0][0];
            
            expect(callArgs).toHaveLength(2);
            expect(callArgs[0].role).toBe('system');
            expect(callArgs[0].content).toContain('mindmap generator');
            expect(callArgs[1].role).toBe('user');
            expect(callArgs[1].content).toContain('Existing Mindmap Structure');
        });

        it('should use correct model configuration', async () => {
            const mockResponse = {
                content: JSON.stringify({ nodes: [], edges: [], summary: 'Test' }),
                raw: {}
            };
            
            mockLLM.chat.mockResolvedValue(mockResponse);
            
            const existingMindmap = { nodes: [], edges: [], version: 1 };
            await mindmapService.generateMindmapUpdates(
                existingMindmap,
                'User: Test',
                'User: Test'
            );
            
            expect(createLLM).toHaveBeenCalledWith('openai', {
                apiKey: 'test-api-key',
                model: 'gpt-4',
                temperature: 0.3,
                maxTokens: 2048
            });
        });
    });
});

