const MindmapService = require('../mindmapService');
const listenService = require('../../listenService');
const summaryRepository = require('../../summary/repositories');
const sessionRepository = require('../../../common/repositories/session');
const sttRepository = require('../../stt/repositories');

// Mock dependencies
jest.mock('../../summary/repositories');
jest.mock('../../../common/repositories/session');
jest.mock('../../stt/repositories');
jest.mock('../../../common/services/modelStateService');
jest.mock('../../../common/ai/factory');
jest.mock('../../../../window/windowManager', () => ({
    windowPool: {
        get: jest.fn().mockReturnValue({
            isDestroyed: jest.fn().mockReturnValue(false),
            webContents: {
                send: jest.fn()
            }
        })
    }
}));

describe('Mindmap Integration', () => {
    let mindmapService;
    let mockListenService;

    beforeEach(() => {
        mindmapService = new MindmapService();
        jest.clearAllMocks();
    });

    describe('Full Flow Integration', () => {
        test('should update mindmap as transcripts arrive', async () => {
            const sessionId = 'test-session-123';
            mindmapService.setSessionId(sessionId);

            // Mock existing mindmap
            const existingMindmap = {
                nodes: [{ id: 'node-1', label: 'Topic 1', level: 1 }],
                edges: [],
                metadata: { sessionId, version: 1 }
            };

            summaryRepository.getSummaryBySessionId.mockResolvedValue({
                mindmap_json: JSON.stringify(existingMindmap)
            });

            // Mock LLM response
            const { createLLM } = require('../../../common/ai/factory');
            const modelStateService = require('../../../common/services/modelStateService');
            
            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });

            const mockLLM = {
                chat: jest.fn().mockResolvedValue({
                    content: JSON.stringify({
                        nodes: [{ id: 'node-2', label: 'Topic 2', level: 1 }],
                        edges: [{ id: 'edge-1', from: 'node-1', to: 'node-2', type: 'related' }],
                        summary: 'Added new topic'
                    })
                })
            };
            createLLM.mockReturnValue(mockLLM);

            summaryRepository.saveSummary.mockResolvedValue({ changes: 1 });

            // Add conversation turns
            mindmapService.addConversationTurn('me', 'What is the budget?');
            mindmapService.addConversationTurn('them', 'The budget is $2.5M');

            // Trigger update
            await mindmapService.updateMindmap();

            // Verify mindmap was updated
            const updatedMindmap = mindmapService.getCurrentMindmap();
            expect(updatedMindmap.nodes.length).toBeGreaterThan(1);
            expect(summaryRepository.saveSummary).toHaveBeenCalled();
        });

        test('should handle empty transcripts gracefully', async () => {
            const sessionId = 'test-session-123';
            mindmapService.setSessionId(sessionId);

            summaryRepository.getSummaryBySessionId.mockResolvedValue(null);

            // No transcripts added, should not update
            await mindmapService.updateMindmap();

            expect(summaryRepository.saveSummary).not.toHaveBeenCalled();
        });

        test('should load existing mindmap from database', async () => {
            const sessionId = 'test-session-123';
            const existingMindmap = {
                nodes: [{ id: 'node-1', label: 'Topic 1', level: 1 }],
                edges: [],
                metadata: { sessionId, version: 5 }
            };

            summaryRepository.getSummaryBySessionId.mockResolvedValue({
                mindmap_json: JSON.stringify(existingMindmap)
            });

            const loaded = await mindmapService.loadMindmapFromDatabase(sessionId);

            expect(loaded).not.toBeNull();
            expect(loaded.nodes).toHaveLength(1);
            expect(loaded.metadata.version).toBe(5);
        });

        test('should handle session reset correctly', () => {
            const sessionId = 'test-session-123';
            mindmapService.setSessionId(sessionId);
            mindmapService.addConversationTurn('me', 'Test message');

            // Reset
            mindmapService.resetConversationHistory();

            const history = mindmapService.getConversationHistory();
            const mindmap = mindmapService.getCurrentMindmap();

            expect(history).toEqual([]);
            expect(mindmap.nodes).toEqual([]);
            expect(mindmap.metadata.sessionId).toBe(sessionId);
        });
    });

    describe('Incremental Updates', () => {
        test('should merge updates without losing existing nodes', async () => {
            const existing = {
                nodes: [
                    { id: 'node-1', label: 'Budget', level: 1 },
                    { id: 'node-2', label: 'Marketing', level: 1 }
                ],
                edges: [],
                metadata: { version: 1 }
            };

            const updates = {
                nodes: [{ id: 'node-3', label: 'Sales', level: 1 }],
                edges: []
            };

            const merged = mindmapService.mergeMindmapUpdates(existing, updates);

            expect(merged.nodes).toHaveLength(3);
            expect(merged.nodes.find(n => n.id === 'node-1')).toBeDefined();
            expect(merged.nodes.find(n => n.id === 'node-2')).toBeDefined();
            expect(merged.nodes.find(n => n.id === 'node-3')).toBeDefined();
        });

        test('should increment version on each update', () => {
            const existing = {
                nodes: [],
                edges: [],
                metadata: { version: 5 }
            };

            const updates = { nodes: [], edges: [] };
            const merged = mindmapService.mergeMindmapUpdates(existing, updates);

            expect(merged.metadata.version).toBe(6);
        });
    });

    describe('Node Summarization', () => {
        test('should summarize older nodes when limit exceeded', () => {
            const mindmap = {
                nodes: Array(150).fill(null).map((_, i) => ({
                    id: `node-${i}`,
                    label: `Node ${i}`,
                    level: 1,
                    metadata: { firstMentioned: Date.now() - ((150 - i) * 1000) }
                })),
                edges: [],
                metadata: {}
            };

            const summarized = mindmapService.summarizeOlderNodes(mindmap, 100);

            expect(summarized.nodes.length).toBeLessThan(150);
            expect(summarized.nodes.some(n => n.type === 'summary')).toBe(true);
        });
    });
});

