/**
 * REAL LLM INTEGRATION TEST
 * 
 * This test makes actual API calls to the configured LLM.
 * Requires valid API keys to be configured in the app.
 * 
 * To run: npm test -- src/features/listen/mindmap/__tests__/mindmapRealLLM.test.js
 * 
 * WARNING: This will consume API tokens and may incur costs.
 */

const MindmapService = require('../mindmapService');
const sttRepository = require('../../stt/repositories');

// Mock only the non-LLM dependencies
jest.mock('../../summary/repositories', () => ({
    getSummaryBySessionId: jest.fn(),
    saveSummary: jest.fn()
}));
jest.mock('../../../../window/windowManager', () => ({
    windowPool: new Map()
}));

describe('MindmapService - REAL LLM Integration Test', () => {
    let mindmapService;

    beforeEach(() => {
        mindmapService = new MindmapService();
        mindmapService.setSessionId('test-session-real-llm');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should generate mindmap from real text using REAL LLM', async () => {
        // Skip if no API key configured (to avoid failing in CI)
        const modelStateService = require('../../../common/services/modelStateService');
        const modelInfo = await modelStateService.getCurrentModelInfo('llm');
        
        if (!modelInfo || !modelInfo.apiKey) {
            console.warn('⚠️  Skipping real LLM test - no API key configured');
            return;
        }

        console.log(`\n🧪 Testing with REAL LLM: ${modelInfo.provider}/${modelInfo.model}\n`);

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

        try {
            // Generate mindmap using REAL LLM
            const result = await mindmapService.generateMindmapFromTranscripts(realTranscripts);

            // Verify result structure
            expect(result).toBeDefined();
            expect(result.nodes).toBeDefined();
            expect(Array.isArray(result.nodes)).toBe(true);
            expect(result.edges).toBeDefined();
            expect(Array.isArray(result.edges)).toBe(true);

            // Verify we got actual nodes (not empty)
            expect(result.nodes.length).toBeGreaterThan(0);
            
            // Verify node structure
            if (result.nodes.length > 0) {
                const firstNode = result.nodes[0];
                expect(firstNode).toHaveProperty('id');
                expect(firstNode).toHaveProperty('label');
                expect(firstNode).toHaveProperty('type');
                expect(firstNode).toHaveProperty('level');
            }

            console.log('\n✅ REAL LLM Test PASSED!');
            console.log(`   Provider: ${modelInfo.provider}`);
            console.log(`   Model: ${modelInfo.model}`);
            console.log(`   Nodes generated: ${result.nodes.length}`);
            console.log(`   Edges generated: ${result.edges.length}`);
            console.log(`   Sample nodes:`, result.nodes.slice(0, 5).map(n => n.label));
            console.log('');

        } catch (error) {
            console.error('\n❌ REAL LLM Test FAILED:');
            console.error(`   Error: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
            console.log('');
            
            // Don't fail the test if it's an API key issue
            if (error.message.includes('API key') || error.message.includes('not configured')) {
                console.warn('⚠️  This appears to be a configuration issue, not a code issue.');
                return;
            }
            
            throw error;
        }
    }, 30000); // 30 second timeout for real API calls
});

