const MindmapService = require('../mindmapService');
const summaryRepository = require('../../summary/repositories');
const modelStateService = require('../../../common/services/modelStateService');
const { createLLM } = require('../../../common/ai/factory');

// Mock dependencies
jest.mock('../../summary/repositories');
jest.mock('../../../common/services/modelStateService');
jest.mock('../../../common/ai/factory');
jest.mock('../../../../window/windowManager', () => ({
    windowPool: new Map()
}));

describe('MindmapService', () => {
    let mindmapService;

    beforeEach(() => {
        mindmapService = new MindmapService();
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with empty mindmap', () => {
            const mindmap = mindmapService.getCurrentMindmap();
            expect(mindmap.nodes).toEqual([]);
            expect(mindmap.edges).toEqual([]);
            expect(mindmap.metadata.version).toBe(0);
        });

        test('should initialize with empty conversation history', () => {
            const history = mindmapService.getConversationHistory();
            expect(history).toEqual([]);
        });
    });

    describe('addConversationTurn', () => {
        test('should add conversation turn to history', () => {
            mindmapService.addConversationTurn('me', 'Hello world');
            const history = mindmapService.getConversationHistory();
            expect(history).toContain('me: Hello world');
        });

        test('should add to pending transcripts', () => {
            mindmapService.addConversationTurn('them', 'Hi there');
            // Access private property for testing
            expect(mindmapService.pendingTranscripts.length).toBe(1);
            expect(mindmapService.pendingTranscripts[0].text).toBe('Hi there');
        });
    });

    describe('resetConversationHistory', () => {
        test('should clear conversation history and mindmap', () => {
            mindmapService.addConversationTurn('me', 'Test');
            mindmapService.setSessionId('test-session');
            mindmapService.resetConversationHistory();
            
            const history = mindmapService.getConversationHistory();
            const mindmap = mindmapService.getCurrentMindmap();
            
            expect(history).toEqual([]);
            expect(mindmap.nodes).toEqual([]);
            expect(mindmap.metadata.version).toBe(0);
        });
    });

    describe('nodesSimilar', () => {
        test('should detect exact matches', () => {
            const similar = mindmapService.nodesSimilar('Budget', 'Budget');
            expect(similar).toBe(true);
        });

        test('should detect case-insensitive matches', () => {
            const similar = mindmapService.nodesSimilar('Budget', 'budget');
            expect(similar).toBe(true);
        });

        test('should detect substring matches', () => {
            const similar = mindmapService.nodesSimilar('Q4 Budget', 'Budget');
            expect(similar).toBe(true);
        });

        test('should detect word overlap', () => {
            // "Budget Review" and "Budget Planning" share "Budget" (1 word out of 2 = 50% similarity)
            // But the threshold is > 0.5, so we need > 50%
            const similar = mindmapService.nodesSimilar('Budget Review Q4', 'Budget Planning Q4');
            expect(similar).toBe(true); // 2 out of 3 words match = 66% > 50%
        });

        test('should return false for different concepts', () => {
            const similar = mindmapService.nodesSimilar('Budget', 'Marketing');
            expect(similar).toBe(false);
        });
    });

    describe('mergeMindmapUpdates', () => {
        test('should add new nodes to existing mindmap', () => {
            const existing = {
                nodes: [{ id: 'node-1', label: 'Topic 1', level: 1 }],
                edges: [],
                metadata: { version: 1 }
            };
            const updates = {
                nodes: [{ id: 'node-2', label: 'Topic 2', level: 1 }],
                edges: []
            };

            const merged = mindmapService.mergeMindmapUpdates(existing, updates);
            
            expect(merged.nodes).toHaveLength(2);
            expect(merged.nodes.find(n => n.id === 'node-1')).toBeDefined();
            expect(merged.nodes.find(n => n.id === 'node-2')).toBeDefined();
            expect(merged.metadata.version).toBe(2);
        });

        test('should merge similar nodes instead of duplicating', () => {
            const existing = {
                nodes: [{ id: 'node-1', label: 'Budget', level: 1, metadata: { transcriptIndices: [1] } }],
                edges: [],
                metadata: { version: 1 }
            };
            const updates = {
                nodes: [{ id: 'node-2', label: 'Q4 Budget', level: 1, metadata: { transcriptIndices: [2] } }],
                edges: []
            };

            const merged = mindmapService.mergeMindmapUpdates(existing, updates);
            
            // Should merge into existing node
            expect(merged.nodes).toHaveLength(1);
            expect(merged.nodes[0].metadata.transcriptIndices).toContain(1);
            expect(merged.nodes[0].metadata.transcriptIndices).toContain(2);
        });

        test('should add new edges', () => {
            const existing = {
                nodes: [
                    { id: 'node-1', label: 'Topic 1', level: 1 },
                    { id: 'node-2', label: 'Topic 2', level: 1 }
                ],
                edges: [],
                metadata: { version: 1 }
            };
            const updates = {
                nodes: [],
                edges: [{ id: 'edge-1', from: 'node-1', to: 'node-2', type: 'related' }]
            };

            const merged = mindmapService.mergeMindmapUpdates(existing, updates);
            
            expect(merged.edges).toHaveLength(1);
            expect(merged.edges[0].from).toBe('node-1');
            expect(merged.edges[0].to).toBe('node-2');
        });

        test('should not duplicate existing edges', () => {
            const existing = {
                nodes: [
                    { id: 'node-1', label: 'Topic 1', level: 1 },
                    { id: 'node-2', label: 'Topic 2', level: 1 }
                ],
                edges: [{ id: 'edge-1', from: 'node-1', to: 'node-2' }],
                metadata: { version: 1 }
            };
            const updates = {
                nodes: [],
                edges: [{ id: 'edge-2', from: 'node-1', to: 'node-2' }]
            };

            const merged = mindmapService.mergeMindmapUpdates(existing, updates);
            
            expect(merged.edges).toHaveLength(1);
        });
    });

    describe('summarizeOlderNodes', () => {
        test('should return mindmap unchanged if under max nodes', () => {
            const mindmap = {
                nodes: Array(50).fill(null).map((_, i) => ({
                    id: `node-${i}`,
                    label: `Node ${i}`,
                    level: 1,
                    metadata: { firstMentioned: Date.now() - (i * 1000) }
                })),
                edges: [],
                metadata: {}
            };

            const summarized = mindmapService.summarizeOlderNodes(mindmap, 100);
            
            expect(summarized.nodes).toHaveLength(50);
        });

        test('should summarize older nodes when over max', () => {
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
            
            // Should have recent nodes + summary nodes
            expect(summarized.nodes.length).toBeLessThan(150);
            expect(summarized.nodes.length).toBeGreaterThan(100);
            expect(summarized.nodes.some(n => n.type === 'summary')).toBe(true);
        });
    });

    describe('generateMindmapUpdates', () => {
        test('should call LLM with correct prompt structure', async () => {
            const existingMindmap = {
                nodes: [{ id: 'node-1', label: 'Topic 1', level: 1 }],
                edges: [],
                metadata: { version: 1 }
            };
            const newTranscripts = 'me: Hello\nthem: Hi';
            const recentConversation = 'me: Hello\nthem: Hi';

            const mockLLM = {
                chat: jest.fn().mockResolvedValue({
                    content: JSON.stringify({
                        nodes: [{ id: 'node-2', label: 'Topic 2', level: 1 }],
                        edges: [],
                        summary: 'Added new topic'
                    })
                })
            };

            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });
            createLLM.mockReturnValue(mockLLM);

            mindmapService.setSessionId('test-session');
            const updates = await mindmapService.generateMindmapUpdates(
                existingMindmap,
                newTranscripts,
                recentConversation
            );

            expect(mockLLM.chat).toHaveBeenCalled();
            expect(updates.nodes).toBeDefined();
        });

        test('should handle LLM response with markdown code blocks', async () => {
            const mockLLM = {
                chat: jest.fn().mockResolvedValue({
                    content: '```json\n{"nodes": [], "edges": []}\n```'
                })
            };

            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });
            createLLM.mockReturnValue(mockLLM);

            mindmapService.setSessionId('test-session');
            const updates = await mindmapService.generateMindmapUpdates(
                { nodes: [], edges: [], metadata: {} },
                'me: Test',
                'me: Test'
            );

            expect(updates).toBeDefined();
            expect(updates.nodes).toBeDefined();
        });

        test('should throw error if no JSON found in response', async () => {
            const mockLLM = {
                chat: jest.fn().mockResolvedValue({
                    content: 'No JSON here'
                })
            };

            modelStateService.getCurrentModelInfo.mockResolvedValue({
                provider: 'openai',
                model: 'gpt-4',
                apiKey: 'test-key'
            });
            createLLM.mockReturnValue(mockLLM);

            mindmapService.setSessionId('test-session');
            
            await expect(
                mindmapService.generateMindmapUpdates(
                    { nodes: [], edges: [], metadata: {} },
                    'me: Test',
                    'me: Test'
                )
            ).rejects.toThrow('No JSON found in LLM response');
        });
    });

    describe('saveMindmap', () => {
        test('should save mindmap to database', async () => {
            const mindmap = {
                nodes: [{ id: 'node-1', label: 'Topic 1' }],
                edges: [],
                metadata: { sessionId: 'test-session', version: 1 }
            };

            summaryRepository.getSummaryBySessionId.mockResolvedValue(null);
            summaryRepository.saveSummary.mockResolvedValue({ changes: 1 });

            mindmapService.setSessionId('test-session');
            await mindmapService.saveMindmap(mindmap);

            expect(summaryRepository.saveSummary).toHaveBeenCalled();
            const callArgs = summaryRepository.saveSummary.mock.calls[0][0];
            expect(callArgs.sessionId).toBe('test-session');
            expect(callArgs.mindmap_json).toBeDefined();
        });

        test('should update existing summary with mindmap', async () => {
            const mindmap = {
                nodes: [{ id: 'node-1', label: 'Topic 1' }],
                edges: [],
                metadata: { sessionId: 'test-session', version: 1 }
            };

            const existingSummary = {
                text: 'Existing summary',
                tldr: 'TLDR',
                bullet_json: '[]',
                action_json: '[]',
                model: 'gpt-4',
                generated_at: 1234567890
            };

            summaryRepository.getSummaryBySessionId.mockResolvedValue(existingSummary);
            summaryRepository.saveSummary.mockResolvedValue({ changes: 1 });

            mindmapService.setSessionId('test-session');
            await mindmapService.saveMindmap(mindmap);

            expect(summaryRepository.saveSummary).toHaveBeenCalled();
            const callArgs = summaryRepository.saveSummary.mock.calls[0][0];
            expect(callArgs.text).toBe('Existing summary');
            expect(callArgs.mindmap_json).toBeDefined();
        });
    });

    describe('Timer Management', () => {
        test('should start update timer when session is set', () => {
            jest.useFakeTimers();
            mindmapService.setSessionId('test-session');
            mindmapService.addConversationTurn('me', 'Test');
            
            expect(mindmapService.updateTimer).toBeDefined();
            
            jest.useRealTimers();
        });

        test('should stop update timer on reset', () => {
            jest.useFakeTimers();
            mindmapService.setSessionId('test-session');
            mindmapService.addConversationTurn('me', 'Test');
            mindmapService.stopUpdateTimer();
            
            expect(mindmapService.updateTimer).toBeNull();
            
            jest.useRealTimers();
        });
    });
});

