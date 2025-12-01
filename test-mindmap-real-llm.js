/**
 * Standalone script to test mindmap generation with REAL LLM
 * 
 * Usage: node test-mindmap-real-llm.js
 * 
 * This script tests the mindmap generation with actual LLM API calls.
 * Requires valid API keys to be configured in the app settings.
 */

const path = require('path');
const sqliteClient = require('./src/features/common/services/sqliteClient');
const MindmapService = require('./src/features/listen/mindmap/mindmapService');

async function testRealLLM() {
    console.log('\n🧪 Testing Mindmap Generation with REAL LLM\n');
    console.log('=' .repeat(60));

    try {
        // Initialize database
        const dbPath = path.join(__dirname, 'data', 'glass.db');
        await sqliteClient.connect(dbPath);
        console.log('✅ Database connected\n');

        // Create mindmap service
        const mindmapService = new MindmapService();
        mindmapService.setSessionId('test-real-llm-session');

        // Real transcript data
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

        console.log(`📝 Input: ${realTranscripts.length} transcripts`);
        console.log(`📏 Total text length: ${realTranscripts.reduce((sum, t) => sum + t.text.length, 0)} characters\n`);

        console.log('🔄 Calling REAL LLM to generate mindmap...\n');

        // Generate mindmap using REAL LLM
        const startTime = Date.now();
        const result = await mindmapService.generateMindmapFromTranscripts(realTranscripts);
        const duration = Date.now() - startTime;

        console.log('\n' + '='.repeat(60));
        console.log('✅ SUCCESS! Mindmap generated with REAL LLM\n');

        // Display results
        console.log(`📊 Results:`);
        console.log(`   ⏱️  Generation time: ${duration}ms`);
        console.log(`   🔵 Nodes: ${result.nodes.length}`);
        console.log(`   🔗 Edges: ${result.edges.length}\n`);

        if (result.nodes.length > 0) {
            console.log(`📋 Nodes:`);
            result.nodes.forEach((node, i) => {
                console.log(`   ${i + 1}. [${node.type}] ${node.label} (level ${node.level})`);
            });
            console.log('');
        }

        if (result.edges.length > 0) {
            console.log(`🔗 Edges:`);
            result.edges.slice(0, 5).forEach((edge, i) => {
                const fromNode = result.nodes.find(n => n.id === edge.from);
                const toNode = result.nodes.find(n => n.id === edge.to);
                console.log(`   ${i + 1}. ${fromNode?.label || edge.from} → ${toNode?.label || edge.to} [${edge.type}]`);
            });
            if (result.edges.length > 5) {
                console.log(`   ... and ${result.edges.length - 5} more edges`);
            }
            console.log('');
        }

        // Validate structure
        console.log('✅ Validation:');
        console.log(`   ✓ Nodes array: ${Array.isArray(result.nodes) ? 'Valid' : 'Invalid'}`);
        console.log(`   ✓ Edges array: ${Array.isArray(result.edges) ? 'Valid' : 'Invalid'}`);
        
        if (result.nodes.length > 0) {
            const firstNode = result.nodes[0];
            console.log(`   ✓ Node structure: ${firstNode.id && firstNode.label ? 'Valid' : 'Invalid'}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 Test completed successfully!\n');

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ TEST FAILED\n');
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        console.error('\n' + '='.repeat(60));
        process.exit(1);
    } finally {
        // Close database
        if (sqliteClient.db) {
            sqliteClient.close();
        }
    }
}

// Run the test
testRealLLM().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

