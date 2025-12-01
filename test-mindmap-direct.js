/**
 * Direct test of mindmap LLM generation
 * Tests the LLM call directly without database dependencies
 * 
 * Usage: node test-mindmap-direct.js
 */

const { createLLM } = require('./src/features/common/ai/factory');
const modelStateService = require('./src/features/common/services/modelStateService');

async function testDirectLLM() {
    console.log('\n🧪 Testing Mindmap Generation - Direct LLM Call\n');
    console.log('='.repeat(60));

    try {
        // Get model info (this will use the actual configured model)
        const modelInfo = await modelStateService.getCurrentModelInfo('llm');
        
        if (!modelInfo || !modelInfo.apiKey) {
            console.error('❌ No LLM API key configured. Please configure an API key in settings.');
            process.exit(1);
        }

        console.log(`📡 Provider: ${modelInfo.provider}`);
        console.log(`🤖 Model: ${modelInfo.model}`);
        console.log(`🔑 API Key: ${modelInfo.apiKey.substring(0, 10)}...\n`);

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

        // Format transcripts
        const formattedTranscripts = realTranscripts.map((t, index) => {
            let timestamp = `[${index}]`;
            if (t.start_at) {
                try {
                    const date = new Date(t.start_at * 1000);
                    if (!isNaN(date.getTime())) {
                        timestamp = date.toLocaleTimeString();
                    }
                } catch (e) {
                    timestamp = `[${index}]`;
                }
            }
            return `[${timestamp}] ${t.speaker || 'unknown'}: ${t.text}`;
        }).join('\n');

        console.log(`📝 Input: ${realTranscripts.length} transcripts`);
        console.log(`📏 Formatted length: ${formattedTranscripts.length} characters\n`);

        // Build prompt
        const prompt = `You are a mindmap generator. Analyze the following conversation transcript and generate a complete mindmap structure.

Conversation Transcript:
${formattedTranscripts}

Instructions:
1. Analyze the entire conversation and identify:
   - Main topics and themes
   - Subtopics and supporting concepts
   - Relationships between concepts
   - Hierarchical structure (main topics → subtopics → details)
   - Concept network connections

2. For each node, include:
   - id: unique identifier (e.g., "node-1", "node-2")
   - label: short, descriptive label (max 30 chars)
   - type: "topic", "concept", "detail", "action", or "decision"
   - level: hierarchical level (1 = main topic, 2 = subtopic, 3 = detail)
   - color: hex color code (use different colors for different types)
   - size: node size (15-25)

3. For each edge, include:
   - id: unique identifier (e.g., "edge-1", "edge-2")
   - from: source node id
   - to: target node id
   - type: "hierarchical", "related", "causes", "enables", etc.
   - color: edge color (hex code)

4. Return ONLY a valid JSON object with this structure:
{
  "nodes": [...],
  "edges": [...]
}

Do not include any markdown formatting, code blocks, or explanatory text. Return only the JSON object.`;

        console.log(`📋 Prompt length: ${prompt.length} characters\n`);
        console.log('🔄 Calling REAL LLM...\n');

        // Create LLM instance
        const llm = createLLM(modelInfo.provider, {
            apiKey: modelInfo.apiKey,
            model: modelInfo.model,
            temperature: 0.3,
            maxTokens: 2048
        });

        // Call LLM
        const startTime = Date.now();
        const response = await llm.chat([
            { role: 'system', content: 'You are a mindmap generator. Return only valid JSON.' },
            { role: 'user', content: prompt }
        ]);
        const duration = Date.now() - startTime;

        console.log('✅ LLM Response Received!\n');
        console.log(`⏱️  Response time: ${duration}ms`);
        console.log(`📦 Response object keys:`, Object.keys(response || {}));

        // Extract response text
        let responseText = '';
        if (response.content) {
            responseText = typeof response.content === 'string' ? response.content : String(response.content);
        } else if (response.text) {
            responseText = typeof response.text === 'function' ? response.text() : (typeof response.text === 'string' ? response.text : String(response.text));
        } else if (response.raw) {
            try {
                const raw = response.raw;
                if (raw.response && raw.response.text) {
                    responseText = typeof raw.response.text === 'function' ? raw.response.text() : String(raw.response.text);
                } else if (raw.candidates && raw.candidates[0] && raw.candidates[0].content) {
                    const parts = raw.candidates[0].content.parts || [];
                    responseText = parts.map(p => p.text || '').join('');
                }
            } catch (e) {
                console.warn('Could not extract from raw response:', e);
            }
        }

        if (!responseText || responseText.length === 0) {
            console.error('\n❌ Empty response received!');
            console.error('Response object:', JSON.stringify(response, null, 2).substring(0, 1000));
            process.exit(1);
        }

        console.log(`\n📄 Response length: ${responseText.length} characters`);
        console.log(`📄 Response preview (first 300 chars):\n${responseText.substring(0, 300)}...\n`);

        // Parse JSON
        let responseTextClean = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let jsonMatch = responseTextClean.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
            console.error('❌ No JSON found in response!');
            console.error('Full response:', responseText);
            process.exit(1);
        }

        const mindmapData = JSON.parse(jsonMatch[0]);

        console.log('='.repeat(60));
        console.log('✅ SUCCESS! Mindmap JSON Parsed\n');
        console.log(`📊 Results:`);
        console.log(`   🔵 Nodes: ${mindmapData.nodes?.length || 0}`);
        console.log(`   🔗 Edges: ${mindmapData.edges?.length || 0}\n`);

        if (mindmapData.nodes && mindmapData.nodes.length > 0) {
            console.log(`📋 Nodes:`);
            mindmapData.nodes.forEach((node, i) => {
                console.log(`   ${i + 1}. [${node.type}] ${node.label} (level ${node.level}, id: ${node.id})`);
            });
            console.log('');
        }

        if (mindmapData.edges && mindmapData.edges.length > 0) {
            console.log(`🔗 Edges (first 5):`);
            mindmapData.edges.slice(0, 5).forEach((edge, i) => {
                const fromNode = mindmapData.nodes?.find(n => n.id === edge.from);
                const toNode = mindmapData.nodes?.find(n => n.id === edge.to);
                console.log(`   ${i + 1}. ${fromNode?.label || edge.from} → ${toNode?.label || edge.to} [${edge.type}]`);
            });
            if (mindmapData.edges.length > 5) {
                console.log(`   ... and ${mindmapData.edges.length - 5} more edges`);
            }
            console.log('');
        }

        // Validate structure
        console.log('✅ Validation:');
        console.log(`   ✓ Valid JSON: Yes`);
        console.log(`   ✓ Has nodes array: ${Array.isArray(mindmapData.nodes) ? 'Yes' : 'No'}`);
        console.log(`   ✓ Has edges array: ${Array.isArray(mindmapData.edges) ? 'Yes' : 'No'}`);
        
        if (mindmapData.nodes && mindmapData.nodes.length > 0) {
            const firstNode = mindmapData.nodes[0];
            console.log(`   ✓ Node structure valid: ${firstNode.id && firstNode.label ? 'Yes' : 'No'}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 REAL LLM Test completed successfully!\n');

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ TEST FAILED\n');
        console.error(`Error: ${error.message}`);
        if (error.stack) {
            console.error(`\nStack trace:\n${error.stack}`);
        }
        console.error('\n' + '='.repeat(60));
        process.exit(1);
    }
}

// Run the test
testDirectLLM().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

