const { getSystemPrompt } = require('../../common/prompts/promptBuilder.js');
const { createLLM } = require('../../common/ai/factory');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('../summary/repositories');
const modelStateService = require('../../common/services/modelStateService');
const sttRepository = require('../stt/repositories');

class MindmapService {
    constructor() {
        this.currentMindmap = {
            nodes: [],
            edges: [],
            metadata: {
                sessionId: null,
                lastUpdated: null,
                version: 0,
                totalTranscripts: 0
            }
        };
        this.conversationHistory = [];
        this.currentSessionId = null;
        this.updateTimer = null;
        this.updateInterval = 60000; // 60 seconds in milliseconds (60000ms = 60s)
        this.pendingTranscripts = [];
        
        console.log(`🗺️ [MindmapService] Initialized with update interval: ${this.updateInterval}ms (${this.updateInterval / 1000}s)`);
        
        // Callbacks
        this.onMindmapUpdate = null;
        this.onStatusUpdate = null;
    }

    setCallbacks({ onMindmapUpdate, onStatusUpdate }) {
        this.onMindmapUpdate = onMindmapUpdate;
        this.onStatusUpdate = onStatusUpdate;
    }

    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
        this.currentMindmap.metadata.sessionId = sessionId;
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    addConversationTurn(speaker, text) {
        const conversationText = `${speaker.toLowerCase()}: ${text.trim()}`;
        this.conversationHistory.push(conversationText);
        this.pendingTranscripts.push({ speaker, text, timestamp: Date.now() });
        
        console.log(`🗺️ [MindmapService] Added conversation turn: ${conversationText}`);
        console.log(`🗺️ [MindmapService] Pending transcripts: ${this.pendingTranscripts.length}`);

        // Start update timer if not already running
        if (!this.updateTimer && this.currentSessionId) {
            this.startUpdateTimer();
        }
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    resetConversationHistory() {
        this.conversationHistory = [];
        this.pendingTranscripts = [];
        this.currentMindmap = {
            nodes: [],
            edges: [],
            metadata: {
                sessionId: this.currentSessionId,
                lastUpdated: null,
                version: 0,
                totalTranscripts: 0
            }
        };
        this.stopUpdateTimer();
        console.log('🗺️ [MindmapService] Conversation history and mindmap reset');
    }

    startUpdateTimer() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // Trigger immediate update if there are pending transcripts
        if (this.pendingTranscripts.length > 0) {
            this.updateMindmap();
        }
        
        // Set up periodic updates - run every 60 seconds regardless of pending transcripts
        // This ensures we always have an up-to-date mindmap from all transcripts
        console.log(`🗺️ [MindmapService] Setting up interval timer with ${this.updateInterval}ms (${this.updateInterval / 1000}s)`);
        this.updateTimer = setInterval(() => {
            if (this.currentSessionId) {
                console.log(`🗺️ [MindmapService] Interval timer triggered - updating mindmap (interval: ${this.updateInterval}ms)`);
                this.updateMindmap();
            }
        }, this.updateInterval);
        
        console.log(`🗺️ [MindmapService] Update timer started (${this.updateInterval / 1000} second interval)`);
    }

    stopUpdateTimer() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
            console.log('🗺️ [MindmapService] Update timer stopped');
        }
    }

    formatConversationForPrompt(conversationTexts, maxTurns = 50) {
        if (conversationTexts.length === 0) return '';
        return conversationTexts.slice(-maxTurns).join('\n');
    }

    /**
     * Merges new nodes and edges into existing mindmap structure
     * Handles smart incremental updates (merges similar nodes, updates relationships)
     */
    mergeMindmapUpdates(existingMindmap, updates) {
        const merged = {
            nodes: [...(existingMindmap.nodes || [])],
            edges: [...(existingMindmap.edges || [])],
            metadata: {
                ...existingMindmap.metadata,
                version: (existingMindmap.metadata?.version || 0) + 1,
                lastUpdated: Date.now()
            }
        };

        // Add new nodes (check for duplicates by label similarity)
        if (updates.nodes && updates.nodes.length > 0) {
            for (const newNode of updates.nodes) {
                // Check if similar node already exists (fuzzy matching)
                const existingNode = merged.nodes.find(n => 
                    this.nodesSimilar(n.label, newNode.label)
                );
                
                if (!existingNode) {
                    // Add new node
                    merged.nodes.push({
                        ...newNode,
                        id: newNode.id || `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    });
                } else {
                    // Update existing node metadata (merge transcript indices)
                    if (newNode.metadata?.transcriptIndices) {
                        existingNode.metadata = existingNode.metadata || {};
                        existingNode.metadata.transcriptIndices = [
                            ...(existingNode.metadata.transcriptIndices || []),
                            ...newNode.metadata.transcriptIndices
                        ];
                    }
                }
            }
        }

        // Add new edges (check for duplicates)
        if (updates.edges && updates.edges.length > 0) {
            for (const newEdge of updates.edges) {
                const existingEdge = merged.edges.find(e => 
                    e.from === newEdge.from && e.to === newEdge.to
                );
                
                if (!existingEdge) {
                    merged.edges.push({
                        ...newEdge,
                        id: newEdge.id || `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    });
                }
            }
        }

        return merged;
    }

    /**
     * Simple similarity check for node labels (fuzzy matching)
     */
    nodesSimilar(label1, label2) {
        if (!label1 || !label2) return false;
        const normalized1 = label1.toLowerCase().trim();
        const normalized2 = label2.toLowerCase().trim();
        
        // Exact match
        if (normalized1 === normalized2) return true;
        
        // One contains the other (for cases like "Budget" vs "Q4 Budget")
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
            return true;
        }
        
        // Word overlap (if more than 50% of words match)
        const words1 = normalized1.split(/\s+/);
        const words2 = normalized2.split(/\s+/);
        const commonWords = words1.filter(w => words2.includes(w));
        const similarity = commonWords.length / Math.max(words1.length, words2.length);
        
        return similarity > 0.5;
    }

    /**
     * Summarizes older nodes into parent nodes to manage complexity
     */
    summarizeOlderNodes(mindmap, maxNodes = 100) {
        if (mindmap.nodes.length <= maxNodes) {
            return mindmap;
        }

        // Sort nodes by first mentioned timestamp
        const sortedNodes = [...mindmap.nodes].sort((a, b) => {
            const timeA = a.metadata?.firstMentioned || 0;
            const timeB = b.metadata?.firstMentioned || 0;
            return timeA - timeB;
        });

        // Keep recent nodes, summarize older ones
        const recentNodes = sortedNodes.slice(-maxNodes);
        const olderNodes = sortedNodes.slice(0, sortedNodes.length - maxNodes);

        // Group older nodes by level/type and create summary nodes
        const summaryNodes = this.createSummaryNodes(olderNodes);
        
        // Update edges to point to summary nodes
        const updatedEdges = this.updateEdgesForSummaries(mindmap.edges, olderNodes, summaryNodes);

        return {
            nodes: [...recentNodes, ...summaryNodes],
            edges: updatedEdges,
            metadata: mindmap.metadata
        };
    }

    createSummaryNodes(olderNodes) {
        // Group by level and create parent summary nodes
        const byLevel = {};
        olderNodes.forEach(node => {
            const level = node.level || 1;
            if (!byLevel[level]) byLevel[level] = [];
            byLevel[level].push(node);
        });

        const summaryNodes = [];
        Object.keys(byLevel).forEach(level => {
            const nodes = byLevel[level];
            if (nodes.length > 0) {
                summaryNodes.push({
                    id: `summary-${level}-${Date.now()}`,
                    label: `${nodes.length} ${nodes[0].type || 'items'}`,
                    type: 'summary',
                    level: parseInt(level),
                    color: '#9B9B9B',
                    size: 15,
                    metadata: {
                        summarizedNodes: nodes.map(n => n.id),
                        firstMentioned: Math.min(...nodes.map(n => n.metadata?.firstMentioned || 0))
                    },
                    expandable: true
                });
            }
        });

        return summaryNodes;
    }

    updateEdgesForSummaries(edges, oldNodes, summaryNodes) {
        const oldNodeIds = new Set(oldNodes.map(n => n.id));
        const updatedEdges = [];

        edges.forEach(edge => {
            const fromIsOld = oldNodeIds.has(edge.from);
            const toIsOld = oldNodeIds.has(edge.to);

            if (fromIsOld && toIsOld) {
                // Both nodes are old, skip this edge (handled by summary)
                return;
            } else if (fromIsOld) {
                // Find appropriate summary node for from
                const summaryNode = summaryNodes.find(s => 
                    s.metadata?.summarizedNodes?.includes(edge.from)
                );
                if (summaryNode) {
                    updatedEdges.push({ ...edge, from: summaryNode.id });
                }
            } else if (toIsOld) {
                // Find appropriate summary node for to
                const summaryNode = summaryNodes.find(s => 
                    s.metadata?.summarizedNodes?.includes(edge.to)
                );
                if (summaryNode) {
                    updatedEdges.push({ ...edge, to: summaryNode.id });
                }
            } else {
                // Both nodes are recent, keep edge as is
                updatedEdges.push(edge);
            }
        });

        return updatedEdges;
    }

    async updateMindmap() {
        if (!this.currentSessionId) {
            console.warn('🗺️ [MindmapService] No active session, skipping mindmap update');
            return;
        }

        try {
            // Get ALL transcripts from the session (not just pending ones)
            const allTranscripts = await sttRepository.getAllTranscriptsBySessionId(this.currentSessionId);
            
            if (!allTranscripts || allTranscripts.length === 0) {
                console.log('🗺️ [MindmapService] No transcripts found for session');
                // Keep existing mindmap if no transcripts yet
                return;
            }

            console.log(`🗺️ [MindmapService] Generating mindmap from ${allTranscripts.length} total transcripts`);

            // Generate complete mindmap from all transcripts with retry logic
            let mindmapData;
            let retries = 2;
            let lastError;
            
            while (retries >= 0) {
                try {
                    mindmapData = await this.generateMindmapFromTranscripts(allTranscripts);
                    if (mindmapData && mindmapData.nodes && mindmapData.edges) {
                        break; // Success
                    }
                } catch (error) {
                    lastError = error;
                    console.warn(`🗺️ [MindmapService] Mindmap generation attempt failed (${2 - retries + 1}/3):`, error.message);
                    if (retries > 0) {
                        // Wait 2 seconds before retry
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                retries--;
            }
            
            if (!mindmapData || !mindmapData.nodes || !mindmapData.edges) {
                throw lastError || new Error('Failed to generate mindmap after retries');
            }

            if (mindmapData && mindmapData.nodes && mindmapData.edges) {
                // Create new complete mindmap (replace existing, don't merge)
                const newMindmap = {
                    nodes: mindmapData.nodes || [],
                    edges: mindmapData.edges || [],
                    metadata: {
                        sessionId: this.currentSessionId,
                        lastUpdated: Date.now(),
                        version: (this.currentMindmap.metadata?.version || 0) + 1,
                        totalTranscripts: allTranscripts.length
                    }
                };

                // Summarize older nodes if needed (to keep graph manageable)
                const finalMindmap = this.summarizeOlderNodes(newMindmap, 200);

                // Save to database
                await this.saveMindmap(finalMindmap);

                // Update current mindmap
                this.currentMindmap = finalMindmap;

                // Clear pending transcripts (we're using all transcripts now)
                this.pendingTranscripts = [];

                // Notify renderer
                if (this.onMindmapUpdate) {
                    this.onMindmapUpdate(finalMindmap);
                }

                console.log(`🗺️ [MindmapService] Mindmap generated: ${finalMindmap.nodes.length} nodes, ${finalMindmap.edges.length} edges`);
            } else {
                console.log('🗺️ [MindmapService] No mindmap generated by LLM');
                this.pendingTranscripts = [];
            }

        } catch (error) {
            console.error('🗺️ [MindmapService] Error updating mindmap:', error);
            
            // Keep existing mindmap on error (don't lose data)
            if (this.currentMindmap && this.currentMindmap.nodes && this.currentMindmap.nodes.length > 0) {
                console.log('🗺️ [MindmapService] Keeping existing mindmap due to error');
            } else {
                // If no mindmap exists, create empty one to prevent repeated errors
                this.currentMindmap = {
                    nodes: [],
                    edges: [],
                    metadata: {
                        sessionId: this.currentSessionId,
                        lastUpdated: Date.now(),
                        version: 0,
                        totalTranscripts: 0,
                        error: error.message
                    }
                };
            }
            
            if (this.onStatusUpdate) {
                this.onStatusUpdate({ type: 'error', message: error.message });
            }
        }
    }

    async generateMindmapFromTranscripts(allTranscripts) {
        // Prefer OpenAI for mindmap generation (better JSON support, higher token limits)
        let modelInfo = null;
        const providerSettingsRepository = require('../../common/repositories/providerSettings');
        
        try {
            // Try to get OpenAI settings first
            const openaiSettings = await providerSettingsRepository.getByProvider('openai');
            if (openaiSettings && openaiSettings.api_key && openaiSettings.selected_llm_model) {
                modelInfo = {
                    provider: 'openai',
                    model: openaiSettings.selected_llm_model,
                    apiKey: openaiSettings.api_key
                };
                console.log('🗺️ [MindmapService] Using OpenAI for mindmap generation');
            }
        } catch (error) {
            console.warn('🗺️ [MindmapService] Could not get OpenAI settings, falling back to current model:', error.message);
        }
        
        // Fallback to current model if OpenAI not available
        if (!modelInfo) {
            modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (modelInfo) {
                console.log(`🗺️ [MindmapService] Using ${modelInfo.provider} for mindmap generation (OpenAI not available)`);
            }
        }
        
        if (!modelInfo || !modelInfo.apiKey) {
            throw new Error('AI model or API key not configured. Please configure an LLM provider (preferably OpenAI) in settings.');
        }

        // Log transcript structure for debugging
        if (allTranscripts.length > 0) {
            console.log(`🗺️ [MindmapService] Sample transcript structure:`, {
                firstTranscript: allTranscripts[0],
                totalCount: allTranscripts.length,
                hasStartAt: allTranscripts[0].start_at !== undefined,
                hasSpeaker: allTranscripts[0].speaker !== undefined,
                hasText: allTranscripts[0].text !== undefined
            });
        }

        // Format all transcripts with timestamps and speaker labels
        const formattedTranscripts = allTranscripts.map((t, index) => {
            // Handle different timestamp formats (seconds vs milliseconds)
            let timestamp = `[${index}]`;
            if (t.start_at) {
                try {
                    // Try as seconds first (Unix timestamp)
                    const date = new Date(t.start_at * 1000);
                    if (!isNaN(date.getTime())) {
                        timestamp = date.toLocaleTimeString();
                    } else {
                        // Try as milliseconds
                        const dateMs = new Date(t.start_at);
                        if (!isNaN(dateMs.getTime())) {
                            timestamp = dateMs.toLocaleTimeString();
                        }
                    }
                } catch (e) {
                    timestamp = `[${index}]`;
                }
            }
            
            const speaker = t.speaker || 'unknown';
            const text = t.text || '';
            
            return `[${timestamp}] ${speaker}: ${text}`;
        }).join('\n');

        // Log formatted transcript length
        console.log(`🗺️ [MindmapService] Formatted transcript length: ${formattedTranscripts.length} characters`);
        console.log(`🗺️ [MindmapService] Formatted transcript preview (first 500 chars):`, formattedTranscripts.substring(0, 500));

        // Validate that we have actual transcript content
        if (!formattedTranscripts || formattedTranscripts.trim().length === 0) {
            throw new Error('No transcript content to generate mindmap from. All transcripts appear to be empty.');
        }

        // Build simple prompt for complete mindmap generation
        const prompt = `Generate a clear, focused mindmap from this conversation transcript. Prioritize the MOST IMPORTANT topics only.

Conversation Transcript:
${formattedTranscripts}

CRITICAL: Focus on the most significant and important topics. Ignore minor details and tangents.

Create a focused mindmap with these rules:
1. Identify ONLY the 3-6 MOST IMPORTANT main topics (level 1) - prioritize topics that are:
   - Central to the conversation
   - Frequently discussed
   - Actionable or decision-critical
   - Thematically significant
2. For each main topic, add ONLY 2-3 KEY subtopics (level 2) - the most relevant points
3. Add level 3 details ONLY if absolutely essential (max 1-2 per subtopic)
4. Keep labels short, clear, and descriptive (max 20 characters)
5. Connect nodes hierarchically: main topics → subtopics → details
6. Only create edges between directly related concepts

Node structure (REQUIRED fields):
- id: "node-1", "node-2", etc. (sequential)
- label: short, clear label (max 20 chars) - use the most important keywords
- type: "topic" (level 1), "subtopic" (level 2), or "detail" (level 3)
- level: 1, 2, or 3
- color: "#4A90E2" for topics, "#50C878" for subtopics, "#FFB347" for details
- size: 20 for level 1, 18 for level 2, 15 for level 3

Edge structure (REQUIRED fields):
- id: "edge-1", "edge-2", etc. (sequential)
- from: source node id
- to: target node id
- type: "hierarchical"
- color: "#888888"

Return ONLY valid JSON (no markdown, no code blocks, no explanations):
{
  "nodes": [...],
  "edges": [...]
}

Remember: Quality over quantity. Focus on the most important topics only. Return only JSON.`;

        // Use higher maxTokens for OpenAI (supports up to 16k+), otherwise use 8192
        const maxTokens = modelInfo.provider === 'openai' || modelInfo.provider === 'openai-glass' 
            ? 16384  // OpenAI models support much higher token limits
            : 8192;  // Other providers
        
        const llm = createLLM(modelInfo.provider, {
            apiKey: modelInfo.apiKey,
            model: modelInfo.model,
            temperature: 0.3,
            maxTokens: maxTokens
        });

        // Log prompt length and model info
        console.log(`🗺️ [MindmapService] Calling LLM with provider: ${modelInfo.provider}, model: ${modelInfo.model}`);
        console.log(`🗺️ [MindmapService] Prompt length: ${prompt.length} characters`);
        console.log(`🗺️ [MindmapService] Transcript count in prompt: ${allTranscripts.length}`);

        const response = await llm.chat([
            { role: 'system', content: 'You are a mindmap generator. Return only valid JSON.' },
            { role: 'user', content: prompt }
        ]);

        console.log(`🗺️ [MindmapService] LLM response received. Response object keys:`, Object.keys(response || {}));

        // Parse response - handle different response formats
        let responseText = '';
        let finishReason = null;
        
        // Try multiple ways to extract content
        if (response.content) {
            // OpenAI and most providers return content directly
            responseText = typeof response.content === 'string' ? response.content : String(response.content);
            
            // Check OpenAI finish_reason in raw response
            if (response.raw && response.raw.choices && response.raw.choices[0]) {
                finishReason = response.raw.choices[0].finish_reason;
            }
        } else if (response.text) {
            responseText = typeof response.text === 'function' ? response.text() : (typeof response.text === 'string' ? response.text : String(response.text));
        } else if (response.raw) {
            // Try to extract from raw response (Gemini or OpenAI format)
            try {
                const raw = response.raw;
                
                // Handle OpenAI format (raw.choices[0].message.content)
                if (raw.choices && raw.choices[0] && raw.choices[0].message) {
                    finishReason = raw.choices[0].finish_reason;
                    responseText = raw.choices[0].message.content || '';
                }
                // Handle Gemini format (raw.response)
                else if (raw.response) {
                    finishReason = raw.response.finishReason || raw.response.finishReason;
                    
                    // Try response.text() method first
                    if (raw.response.text && typeof raw.response.text === 'function') {
                        try {
                            responseText = raw.response.text();
                        } catch (e) {
                            console.warn('🗺️ [MindmapService] response.text() failed:', e.message);
                        }
                    } else if (typeof raw.response.text === 'string') {
                        responseText = raw.response.text;
                    }
                    
                    // If still empty, try candidates array
                    if (!responseText && raw.response.candidates && raw.response.candidates.length > 0) {
                        const candidate = raw.response.candidates[0];
                        finishReason = candidate.finishReason || finishReason;
                        
                        // Check content.parts
                        if (candidate.content && candidate.content.parts) {
                            const parts = candidate.content.parts;
                            responseText = parts
                                .map(part => {
                                    if (part.text) return part.text;
                                    if (typeof part === 'string') return part;
                                    return '';
                                })
                                .filter(text => text.length > 0)
                                .join('');
                        }
                        
                        // If still empty, check if content itself has text
                        if (!responseText && candidate.content) {
                            if (typeof candidate.content === 'string') {
                                responseText = candidate.content;
                            } else if (candidate.content.text) {
                                responseText = typeof candidate.content.text === 'function' 
                                    ? candidate.content.text() 
                                    : String(candidate.content.text);
                            }
                        }
                    }
                }
                
                // Fallback: check raw.candidates directly
                if (!responseText && raw.candidates && raw.candidates[0]) {
                    const candidate = raw.candidates[0];
                    finishReason = candidate.finishReason || finishReason;
                    if (candidate.content && candidate.content.parts) {
                        const parts = candidate.content.parts;
                        responseText = parts.map(p => p.text || '').join('');
                    }
                }
            } catch (e) {
                console.warn('🗺️ [MindmapService] Could not extract from raw response:', e);
            }
        }
        
        // Log finishReason if present
        if (finishReason) {
            if (finishReason === 'MAX_TOKENS') {
                console.warn(`⚠️  [MindmapService] LLM hit MAX_TOKENS limit. Response may be incomplete. Consider increasing maxTokens.`);
            } else {
                console.log(`🗺️ [MindmapService] Finish reason: ${finishReason}`);
            }
        }
        
        // Log response for debugging
        if (responseText && responseText.length > 0) {
            console.log(`🗺️ [MindmapService] LLM response received (${responseText.length} chars, first 200):`, responseText.substring(0, 200));
        } else {
            console.error(`🗺️ [MindmapService] Empty LLM response! Response object structure:`, {
                hasContent: !!response.content,
                hasText: !!response.text,
                hasRaw: !!response.raw,
                keys: Object.keys(response || {}),
                rawType: typeof response.raw,
                contentType: typeof response.content,
                textType: typeof response.text,
                finishReason: finishReason,
                fullResponse: JSON.stringify(response, null, 2).substring(0, 1000)
            });
            throw new Error(`LLM returned empty response. Finish reason: ${finishReason || 'unknown'}. Check API key, model configuration, and consider increasing maxTokens.`);
        }
        
        // Remove markdown code blocks if present
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Extract JSON from response - try multiple patterns
        let jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        // If no match, try to find JSON array or object at start
        if (!jsonMatch) {
            // Try to find JSON starting from first {
            const firstBrace = responseText.indexOf('{');
            if (firstBrace !== -1) {
                // Try to find matching closing brace
                let braceCount = 0;
                let endIndex = firstBrace;
                for (let i = firstBrace; i < responseText.length; i++) {
                    if (responseText[i] === '{') braceCount++;
                    if (responseText[i] === '}') braceCount--;
                    if (braceCount === 0) {
                        endIndex = i + 1;
                        break;
                    }
                }
                if (braceCount === 0) {
                    jsonMatch = [responseText.substring(firstBrace, endIndex)];
                }
            }
        }
        
        if (!jsonMatch) {
            console.error(`🗺️ [MindmapService] No JSON found in response. Full response:`, responseText);
            throw new Error(`No JSON found in LLM response. Response: ${responseText.substring(0, 200)}`);
        }

        let updates;
        try {
            updates = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error(`🗺️ [MindmapService] JSON parse error:`, parseError);
            console.error(`🗺️ [MindmapService] Attempted to parse:`, jsonMatch[0].substring(0, 500));
            throw new Error(`Failed to parse JSON from LLM response: ${parseError.message}`);
        }
        
        // Validate structure
        if (!updates || typeof updates !== 'object') {
            throw new Error(`Invalid mindmap structure: expected object, got ${typeof updates}`);
        }
        
        // Ensure nodes and edges are arrays
        if (!Array.isArray(updates.nodes)) {
            updates.nodes = [];
        }
        if (!Array.isArray(updates.edges)) {
            updates.edges = [];
        }
        
        console.log(`🗺️ [MindmapService] Generated updates: ${updates.nodes?.length || 0} nodes, ${updates.edges?.length || 0} edges`);
        
        return updates;
    }

    async saveMindmap(mindmap) {
        if (!this.currentSessionId) {
            throw new Error('No active session to save mindmap');
        }

        try {
            // Get existing summary or create new one
            const existingSummary = await summaryRepository.getSummaryBySessionId(this.currentSessionId);
            
            const mindmapJson = JSON.stringify(mindmap);
            const now = Math.floor(Date.now() / 1000);

            if (existingSummary) {
                // Update existing summary with mindmap
                await summaryRepository.saveSummary({
                    sessionId: this.currentSessionId,
                    mindmap_json: mindmapJson,
                    // Preserve other summary fields
                    text: existingSummary.text || '',
                    tldr: existingSummary.tldr || '',
                    bullet_json: existingSummary.bullet_json || '',
                    action_json: existingSummary.action_json || '',
                    model: existingSummary.model || 'unknown',
                    generated_at: existingSummary.generated_at || now,
                    updated_at: now
                });
            } else {
                // Create new summary entry with just mindmap
                await summaryRepository.saveSummary({
                    sessionId: this.currentSessionId,
                    mindmap_json: mindmapJson,
                    text: '',
                    tldr: '',
                    bullet_json: '',
                    action_json: '',
                    model: 'unknown',
                    generated_at: now,
                    updated_at: now
                });
            }

            console.log('🗺️ [MindmapService] Mindmap saved to database');
        } catch (error) {
            console.error('🗺️ [MindmapService] Error saving mindmap:', error);
            throw error;
        }
    }

    getCurrentMindmap() {
        return this.currentMindmap;
    }

    async loadMindmapFromDatabase(sessionId) {
        try {
            const summary = await summaryRepository.getSummaryBySessionId(sessionId);
            if (summary && summary.mindmap_json) {
                this.currentMindmap = typeof summary.mindmap_json === 'string'
                    ? JSON.parse(summary.mindmap_json)
                    : summary.mindmap_json;
                return this.currentMindmap;
            }
            return null;
        } catch (error) {
            console.error('🗺️ [MindmapService] Error loading mindmap:', error);
            return null;
        }
    }
}

module.exports = MindmapService;

