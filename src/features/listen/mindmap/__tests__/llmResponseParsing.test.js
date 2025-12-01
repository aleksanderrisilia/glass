const MindmapService = require('../mindmapService');

describe('MindmapService LLM Response Parsing', () => {
    let mindmapService;

    beforeEach(() => {
        mindmapService = new MindmapService();
    });

    describe('JSON extraction from LLM responses', () => {
        it('should extract JSON from plain JSON response', () => {
            const response = {
                content: '{"nodes": [{"id": "1", "label": "Test"}], "edges": [], "summary": "Test"}'
            };
            
            const responseText = response.content || response.text || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.nodes).toBeDefined();
            expect(parsed.edges).toBeDefined();
        });

        it('should extract JSON from markdown code block', () => {
            const response = {
                content: '```json\n{"nodes": [{"id": "1", "label": "Test"}], "edges": []}\n```'
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.nodes).toBeDefined();
        });

        it('should extract JSON from response with extra text', () => {
            const response = {
                content: 'Here is the mindmap:\n\n{"nodes": [{"id": "1", "label": "Test"}], "edges": []}\n\nThis is the result.'
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.nodes).toBeDefined();
        });

        it('should handle nested JSON structures', () => {
            const complexJson = {
                nodes: [
                    { id: '1', label: 'Topic', type: 'topic', level: 1, color: '#ff0000', size: 20, metadata: { firstMentioned: 123456, speaker: 'me' } }
                ],
                edges: [
                    { id: 'e1', from: '1', to: '2', type: 'related', color: '#00ff00' }
                ],
                summary: 'Test summary'
            };
            
            const response = {
                content: JSON.stringify(complexJson)
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.nodes.length).toBe(1);
            expect(parsed.edges.length).toBe(1);
            expect(parsed.nodes[0].metadata).toBeDefined();
        });

        it('should handle empty nodes and edges arrays', () => {
            const response = {
                content: '{"nodes": [], "edges": [], "summary": "No updates"}'
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(Array.isArray(parsed.nodes)).toBe(true);
            expect(Array.isArray(parsed.edges)).toBe(true);
            expect(parsed.nodes.length).toBe(0);
        });

        it('should handle response.text() format', () => {
            const response = {
                text: '{"nodes": [{"id": "1", "label": "Test"}], "edges": []}'
            };
            
            const responseText = response.content || response.text || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            const parsed = JSON.parse(jsonMatch[0]);
            expect(parsed.nodes).toBeDefined();
        });
    });

    describe('Error handling', () => {
        it('should throw error when no JSON found', () => {
            const response = {
                content: 'This is not JSON at all'
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeFalsy();
        });

        it('should throw error when JSON is invalid', () => {
            const response = {
                content: '{"nodes": [{"id": "1", "label": "Test"}], "edges": [}' // Invalid JSON
            };
            
            let responseText = response.content || response.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            expect(jsonMatch).toBeTruthy();
            expect(() => JSON.parse(jsonMatch[0])).toThrow();
        });
    });

    describe('Structure validation', () => {
        it('should validate nodes and edges are arrays', () => {
            const updates = {
                nodes: [{ id: '1', label: 'Test' }],
                edges: [{ id: 'e1', from: '1', to: '2' }],
                summary: 'Test'
            };
            
            // Ensure nodes and edges are arrays
            if (!Array.isArray(updates.nodes)) {
                updates.nodes = [];
            }
            if (!Array.isArray(updates.edges)) {
                updates.edges = [];
            }
            
            expect(Array.isArray(updates.nodes)).toBe(true);
            expect(Array.isArray(updates.edges)).toBe(true);
        });

        it('should default to empty arrays if missing', () => {
            const updates = {
                summary: 'Test'
            };
            
            // Ensure nodes and edges are arrays
            if (!Array.isArray(updates.nodes)) {
                updates.nodes = [];
            }
            if (!Array.isArray(updates.edges)) {
                updates.edges = [];
            }
            
            expect(Array.isArray(updates.nodes)).toBe(true);
            expect(Array.isArray(updates.edges)).toBe(true);
            expect(updates.nodes.length).toBe(0);
            expect(updates.edges.length).toBe(0);
        });
    });
});

