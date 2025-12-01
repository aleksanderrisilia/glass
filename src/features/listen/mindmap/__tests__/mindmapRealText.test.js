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
jest.mock('../../../../window/windowManager', () => ({
    windowPool: new Map()
}));

describe('MindmapService - Real Text Test', () => {
    let mindmapService;
    let mockLLM;

    beforeEach(() => {
        mindmapService = new MindmapService();
        mindmapService.setSessionId('test-session-real-text');
        
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

    test('should generate mindmap from real conversation text about AI curiosity', async () => {
        // Real transcript data based on user's text
        const realTranscripts = [
            {
                speaker: 'them',
                text: 'Misaligned AI curiosity poses significant risks.',
                start_at: Math.floor(Date.now() / 1000) - 300
            },
            {
                speaker: 'them',
                text: 'Detrimental pursuit of knowledge: AI might explore paths harmful to humanity if curiosity isn\'t guided by human values.',
                start_at: Math.floor(Date.now() / 1000) - 280
            },
            {
                speaker: 'them',
                text: 'Example: An AI could prioritize optimizing a system (e.g., resource allocation) without considering human well-being or ethical implications, leading to unintended negative outcomes.',
                start_at: Math.floor(Date.now() / 1000) - 260
            },
            {
                speaker: 'them',
                text: 'Prioritization of non-human interests: An AI\'s curiosity might lead it to find non-human entities or goals more "interesting" or valuable than humanity\'s continuation.',
                start_at: Math.floor(Date.now() / 1000) - 240
            },
            {
                speaker: 'them',
                text: 'As discussed in the conversation (22:59:12), the speaker suggests AI should find humanity more interesting than "a bunch of rocks" (22:59:29) to support its prosperity. If curiosity is misaligned, this preference could reverse.',
                start_at: Math.floor(Date.now() / 1000) - 220
            },
            {
                speaker: 'them',
                text: 'Unforeseen complex outcomes: The complex interactions of an AI\'s learning and curiosity could lead to emergent behaviors that are difficult to predict or control, especially if its foundational values diverge from human ethics',
                start_at: Math.floor(Date.now() / 1000) - 200
            }
        ];

        // Mock a realistic LLM response
        const mockMindmapResponse = {
            nodes: [
                { id: 'node-1', label: 'AI Curiosity Risks', type: 'topic', level: 1, color: '#ff0000', size: 20 },
                { id: 'node-2', label: 'Detrimental Knowledge', type: 'concept', level: 2, color: '#ff8800', size: 18 },
                { id: 'node-3', label: 'Non-Human Interests', type: 'concept', level: 2, color: '#ff8800', size: 18 },
                { id: 'node-4', label: 'Unforeseen Outcomes', type: 'concept', level: 2, color: '#ff8800', size: 18 },
                { id: 'node-5', label: 'Resource Optimization', type: 'detail', level: 3, color: '#ffff00', size: 15 },
                { id: 'node-6', label: 'Human Values', type: 'concept', level: 2, color: '#00ff00', size: 18 }
            ],
            edges: [
                { id: 'edge-1', from: 'node-1', to: 'node-2', type: 'hierarchical', color: '#888888' },
                { id: 'edge-2', from: 'node-1', to: 'node-3', type: 'hierarchical', color: '#888888' },
                { id: 'edge-3', from: 'node-1', to: 'node-4', type: 'hierarchical', color: '#888888' },
                { id: 'edge-4', from: 'node-2', to: 'node-5', type: 'related', color: '#888888' },
                { id: 'edge-5', from: 'node-2', to: 'node-6', type: 'related', color: '#888888' }
            ]
        };

        const mockResponse = {
            content: JSON.stringify(mockMindmapResponse),
            raw: {}
        };
        
        mockLLM.chat.mockResolvedValue(mockResponse);

        // Generate mindmap
        const result = await mindmapService.generateMindmapFromTranscripts(realTranscripts);

        // Verify LLM was called
        expect(mockLLM.chat).toHaveBeenCalledTimes(1);
        const callArgs = mockLLM.chat.mock.calls[0][0];
        
        // Verify system message requests JSON
        expect(callArgs[0].role).toBe('system');
        expect(callArgs[0].content).toContain('JSON');
        
        // Verify user message contains the transcript
        expect(callArgs[1].role).toBe('user');
        expect(callArgs[1].content).toContain('Misaligned AI curiosity');
        expect(callArgs[1].content).toContain('Detrimental pursuit');
        expect(callArgs[1].content).toContain('non-human interests'); // Case-insensitive check
        
        // Verify result structure
        expect(result).toBeDefined();
        expect(result.nodes).toBeDefined();
        expect(Array.isArray(result.nodes)).toBe(true);
        expect(result.edges).toBeDefined();
        expect(Array.isArray(result.edges)).toBe(true);
        
        // Verify nodes contain expected concepts
        const nodeLabels = result.nodes.map(n => n.label.toLowerCase());
        expect(nodeLabels.some(label => label.includes('curiosity') || label.includes('ai'))).toBe(true);
        
        console.log('✅ Mindmap generated successfully from real text');
        console.log(`   Nodes: ${result.nodes.length}`);
        console.log(`   Edges: ${result.edges.length}`);
        console.log(`   Sample nodes:`, result.nodes.slice(0, 3).map(n => n.label));
    });

    test('should format transcripts correctly with timestamps', async () => {
        const transcripts = [
            { speaker: 'them', text: 'Test message 1', start_at: 1234567890 },
            { speaker: 'me', text: 'Test message 2', start_at: 1234567900 }
        ];

        const mockResponse = {
            content: JSON.stringify({ nodes: [], edges: [] }),
            raw: {}
        };
        
        mockLLM.chat.mockResolvedValue(mockResponse);

        await mindmapService.generateMindmapFromTranscripts(transcripts);

        const callArgs = mockLLM.chat.mock.calls[0][0];
        const userContent = callArgs[1].content;
        
        // Verify timestamps are formatted
        expect(userContent).toMatch(/\[\d{1,2}:\d{2}:\d{2}\s(AM|PM)\]/);
        
        // Verify speaker labels
        expect(userContent).toContain('them:');
        expect(userContent).toContain('me:');
        
        // Verify text content
        expect(userContent).toContain('Test message 1');
        expect(userContent).toContain('Test message 2');
    });
});

