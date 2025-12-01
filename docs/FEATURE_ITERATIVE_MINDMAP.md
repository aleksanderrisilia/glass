# Feature: Iterative Live Conversation Mindmap

## Overview

**Vision Statement**: As conversations unfold in real-time, Glass builds a visual mindmap that grows organically with the transcript. This creates an intuitive, visual representation of the conversation's structure, relationships, and key concepts—making complex discussions instantly comprehensible at a glance.

**Design Philosophy**: Think different. Visual thinking. The mindmap should feel alive, growing naturally as the conversation progresses. It's not just a static diagram—it's a living, breathing representation of the conversation's evolving knowledge structure.

---

## Problem Statement

Currently, users can view:
1. **Show Transcript** - Raw conversation text
2. **Show Insights** - Structured analysis (summary, topics, actions)

**The Gap**: While insights provide structured text analysis, there's no visual representation of how concepts, topics, and relationships connect. Users need to mentally map relationships between:
- Main topics and subtopics
- Key concepts and their connections
- Speakers and their contributions
- Decisions and their implications
- Action items and their dependencies

A visual mindmap would make these relationships immediately apparent.

---

## Solution: Iterative Mindmap Generation

### Core Behavior

**When listening is active:**
- Mindmap is generated and updated iteratively as new transcripts arrive
- Each update builds upon the previous mindmap structure
- Visual representation shows nodes (concepts/topics) and edges (relationships)
- Mindmap grows organically, maintaining context from previous conversation segments

**View Toggle:**
- Add "Show Mindmap" option alongside "Show Insights" and "Show Transcript"
- Three-way toggle: Insights ↔ Transcript ↔ Mindmap
- Mindmap view displays interactive, zoomable, pannable visualization

### Key Principles

1. **Iterative Growth**: Mindmap updates incrementally, not rebuilt from scratch
2. **Visual Clarity**: Clean, intuitive node-link diagram
3. **Real-Time Updates**: Smooth animations as new nodes/connections appear
4. **Context Preservation**: Previous structure is maintained and extended
5. **Performance**: Efficient rendering even with 100+ nodes

---

## Clarifying Questions

### 1. Mindmap Structure & Format

**Q1.1**: What should the mindmap structure represent?
- [ ] **Option A**: Hierarchical topic structure (main topic → subtopics → details)
- [ ] **Option B**: Concept network (concepts as nodes, relationships as edges)
- [ ] **Option C**: Hybrid (both hierarchy and relationships)
- [ ] **Option D**: Speaker-based (different colors for different speakers)

**Q1.2**: What format should the mindmap data be in?
- [ ] **Option A**: JSON structure (nodes + edges array)
- [ ] **Option B**: Mermaid syntax (for rendering)
- [ ] **Option C**: Graphviz DOT format
- [ ] **Option D**: Custom format optimized for our use case

**Recommendation**: **Option A (JSON)** - Most flexible, easy to store, works with any visualization library.

### 2. Update Strategy

**Q2.1**: How should the mindmap update as new transcripts arrive?
- [ ] **Option A**: Incremental updates (add new nodes/edges, keep existing)
- [ ] **Option B**: Full rebuild every N transcripts (e.g., every 10)
- [ ] **Option C**: Smart incremental (merge similar nodes, update relationships)
- [ ] **Option D**: Hybrid (incremental for small changes, rebuild for major shifts)

**Q2.2**: How often should updates occur?
- [ ] **Option A**: Every new transcript turn
- [ ] **Option B**: Every N transcript turns (e.g., every 5)
- [x] **Option C**: Time-based (e.g., every 30 seconds) ✅ **Selected: Every 1 minute**
- [ ] **Option D**: Threshold-based (when X new concepts detected)

**Decision**: **Option C (Time-based, every 1 minute)** - Consistent updates without overwhelming the system.

### 3. Visualization Library

**Q3.1**: Which visualization library should we use?
- [x] **Option A**: D3.js (most powerful, most complex) ✅ **Selected**
- [ ] **Option B**: vis-network (good performance, easy to use)
- [ ] **Option C**: Cytoscape.js (graph theory focused)
- [ ] **Option D**: Mermaid.js (declarative, simple)
- [ ] **Option E**: Custom Canvas/SVG implementation

**Decision**: **D3.js** - Maximum flexibility for custom interactions and expandable nodes.

### 4. LLM Integration

**Q4.1**: How should the LLM generate mindmap structure?
- [ ] **Option A**: Generate full JSON structure from transcripts
- [x] **Option B**: Generate incremental updates (new nodes/edges to add) ✅ **Selected**
- [ ] **Option C**: Generate Mermaid syntax, convert to JSON
- [ ] **Option D**: Generate natural language description, parse to structure

**Q4.2**: What prompt structure should we use?
- [ ] **Option A**: Single prompt: "Generate mindmap from this conversation"
- [ ] **Option B**: Two-step: 1) Extract concepts 2) Map relationships
- [x] **Option C**: Contextual: Include previous mindmap structure in prompt ✅ **Selected**
- [ ] **Option D**: Streaming: Generate nodes incrementally as conversation progresses

**Decision**: **Incremental updates with contextual prompts** - Efficient and maintains continuity.

### 5. Data Persistence

**Q5.1**: Should mindmap data be stored in the database?
- [ ] **Option A**: Yes, store in `summaries` table (add `mindmap_json` column)
- [ ] **Option B**: Yes, create new `mindmaps` table
- [ ] **Option C**: No, generate on-demand from transcripts
- [ ] **Option D**: Cache in memory, persist only on session end

**Q5.2**: Should mindmap be synced to Firebase?
- [ ] **Option A**: Yes, same as summaries
- [ ] **Option B**: No, local only
- [ ] **Option C**: Yes, but encrypted

**Recommendation**: **Option A (summaries table)** with **Option C (encrypted)** - Consistent with existing architecture.

### 6. UI/UX Details

**Q6.1**: How should the mindmap be displayed?
- [ ] **Option A**: Full-screen view in listen window
- [ ] **Option B**: Scrollable/zoomable canvas
- [ ] **Option C**: Auto-layout with physics simulation
- [ ] **Option D**: Hierarchical tree layout (top-down or left-right)

**Q6.2**: Should users be able to interact with the mindmap?
- [ ] **Option A**: View-only (no interaction)
- [x] **Option B**: Click nodes to expand and show more detail nodes ✅ **Selected**
- [ ] **Option C**: Drag nodes to reorganize
- [ ] **Option D**: Filter by speaker/topic/time

**Decision**: **Clickable nodes that expand** - Progressive disclosure of information, keeps initial view clean.

### 7. Performance & Limits

**Q7.1**: What are the performance constraints?
- Maximum nodes: [x] Unlimited ✅ **No restriction**
- Update frequency: [x] Every 1 minute ✅ **Selected**
- Animation: [x] Smooth transitions ✅ **Selected**

**Q7.2**: How should we handle very long conversations?
- [ ] **Option A**: Limit to last N transcripts (e.g., last 50)
- [x] **Option B**: Summarize older nodes into parent nodes ✅ **Selected**
- [ ] **Option C**: Multiple mindmaps (one per topic section)
- [ ] **Option D**: Lazy loading (load nodes as user zooms/pans)

**Decision**: **No node limit, summarize older nodes** - Scale naturally with conversation length.

---

## Technical Specification (Proposed - Pending Answers)

### 1. Mindmap Data Structure

```json
{
  "nodes": [
    {
      "id": "node-1",
      "label": "Q4 Budget",
      "type": "topic",
      "level": 1,
      "color": "#4A90E2",
      "size": 20,
      "metadata": {
        "firstMentioned": 1234567890,
        "speaker": "them",
        "transcriptIndices": [5, 12, 18]
      }
    },
    {
      "id": "node-2",
      "label": "$2.5M",
      "type": "detail",
      "level": 2,
      "color": "#7ED321",
      "size": 15,
      "metadata": {
        "firstMentioned": 1234567900,
        "speaker": "them",
        "transcriptIndices": [6]
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "node-1",
      "to": "node-2",
      "label": "amount",
      "type": "property",
      "color": "#9B9B9B"
    }
  ],
  "metadata": {
    "sessionId": "session-123",
    "lastUpdated": 1234567890,
    "version": 5,
    "totalTranscripts": 25
  }
}
```

### 2. Update Flow

```
1. New transcripts arrive (every 5 turns)
2. Fetch current mindmap structure (or initialize empty)
3. Format transcripts for LLM prompt
4. Call LLM with prompt: "Update this mindmap with new conversation context"
5. LLM returns incremental updates (new nodes/edges to add)
6. Merge updates into existing structure
7. Render updated mindmap with smooth animations
8. Persist to database
```

### 3. LLM Prompt Structure

```
System: You are a mindmap generator. Given a conversation transcript and an existing mindmap structure, generate incremental updates to the mindmap.

Existing Mindmap:
{existingMindmapJSON}

New Conversation Segment:
{newTranscripts}

Instructions:
1. Identify new concepts/topics mentioned
2. Identify relationships between new and existing concepts
3. Return JSON with only NEW nodes and edges to add
4. Do not modify existing nodes (only add new ones)
5. Maintain hierarchical structure (topics → subtopics → details)

Return format:
{
  "nodes": [...],
  "edges": [...],
  "summary": "Brief description of what was added"
}
```

### 4. Component Structure

```
src/
  features/
    listen/
      mindmap/
        mindmapService.js          # Core logic for mindmap generation
        repositories/
          index.js                 # Repository adapter
          sqlite.repository.js     # SQLite implementation
          firebase.repository.js    # Firebase implementation
  ui/
    listen/
      mindmap/
        MindmapView.js             # LitElement component for rendering
```

### 5. File Structure

**Total Files Affected: 15**

#### Core Service Layer
```
src/features/listen/mindmap/
├── mindmapService.js                    # Main mindmap generation logic
└── __tests__/
    ├── mindmapService.test.js          # Unit tests
    ├── mindmapIntegration.test.js      # Integration tests
    ├── llmResponseParsing.test.js      # LLM response parsing tests
    └── llmIntegration.test.js          # LLM integration tests
```

#### UI Layer
```
src/ui/listen/
├── ListenView.js                        # Main listen view (added mindmap toggle)
└── mindmap/
    └── MindmapView.js                   # D3.js mindmap visualization component
```

#### Data Layer
```
src/features/common/config/
└── schema.js                            # Added 'mindmap_json' column to summaries table

src/features/listen/summary/repositories/
├── sqlite.repository.js                 # Added mindmap_json to saveSummary()
└── firebase.repository.js               # Added mindmap_json to saveSummary()
```

#### Integration Points
```
src/features/listen/
└── listenService.js                     # Integrates mindmapService, calls addConversationTurn()

src/preload.js                           # Added mindmap IPC listeners (onMindmapUpdate)

src/ui/app/
└── content.html                         # Added D3.js library import
```

#### Documentation
```
docs/
└── FEATURE_ITERATIVE_MINDMAP.md         # Feature specification document
```

#### AI Provider Enhancement
```
src/features/common/ai/providers/
└── gemini.js                            # Enhanced to handle JSON mode responses
```

**Summary:**
- **Core**: 1 service + 4 test files
- **UI**: 2 components (ListenView + MindmapView)
- **Data**: 3 files (schema + 2 repository implementations)
- **Integration**: 3 files (listenService, preload, content.html)
- **Documentation**: 1 feature doc
- **Provider**: 1 enhancement (gemini.js)

**Database Changes:**
- 1 column added: `mindmap_json` in `summaries` table

**External Dependencies:**
- D3.js (loaded from CDN in content.html)

### 6. Integration Points

**ListenView.js**:
- Add `'mindmap'` to `viewMode` options
- Add "Show Mindmap" toggle button
- Import and render `MindmapView` component

**listenService.js**:
- Initialize `mindmapService` alongside `summaryService`
- Call `mindmapService.addConversationTurn()` when transcripts arrive
- Trigger mindmap updates similar to summary updates

**Database Schema**:
- Add `mindmap_json` column to `summaries` table (or create new `mindmaps` table)

---

## Implementation Plan

### Phase 1: Foundation
1. Create `mindmapService.js` with basic structure
2. Define mindmap data structure
3. Create repository layer (SQLite + Firebase)
4. Add database schema migration

### Phase 2: LLM Integration
1. Design LLM prompt for mindmap generation
2. Implement incremental update logic
3. Add context preservation (previous mindmap in prompt)
4. Handle edge cases (empty transcripts, very long conversations)

### Phase 3: UI Components
1. Create `MindmapView.js` component
2. Integrate visualization library (vis-network or D3.js)
3. Add zoom/pan/scroll functionality
4. Implement smooth update animations

### Phase 4: Integration
1. Add mindmap toggle to `ListenView.js`
2. Connect `mindmapService` to `listenService`
3. Test iterative updates with real conversations
4. Performance optimization

### Phase 5: Testing
1. Unit tests for mindmap generation logic
2. Integration tests for LLM calls
3. UI tests for rendering and interactions
4. Performance tests for large mindmaps

---

## Testing Strategy

### Unit Tests

**File**: `src/features/listen/mindmap/__tests__/mindmapService.test.js`

```javascript
describe('MindmapService', () => {
    test('should initialize empty mindmap', () => {
        // Test initial state
    });
    
    test('should generate mindmap from transcripts', async () => {
        // Test LLM integration
    });
    
    test('should merge incremental updates', () => {
        // Test update logic
    });
    
    test('should handle empty transcripts', () => {
        // Test edge cases
    });
    
    test('should preserve previous structure on update', () => {
        // Test context preservation
    });
});
```

### Integration Tests

**File**: `src/features/listen/mindmap/__tests__/mindmapIntegration.test.js`

```javascript
describe('Mindmap Integration', () => {
    test('should update mindmap as transcripts arrive', async () => {
        // Test full flow: transcripts → LLM → mindmap → render
    });
    
    test('should persist mindmap to database', async () => {
        // Test database operations
    });
    
    test('should load existing mindmap on session resume', async () => {
        // Test persistence and retrieval
    });
});
```

### UI Tests

**File**: `src/ui/listen/mindmap/__tests__/MindmapView.test.js`

```javascript
describe('MindmapView', () => {
    test('should render mindmap from data', () => {
        // Test rendering
    });
    
    test('should update smoothly when data changes', () => {
        // Test animations
    });
    
    test('should handle zoom/pan interactions', () => {
        // Test user interactions
    });
});
```

---

## Success Metrics

1. **Accuracy**: Mindmap correctly represents conversation structure
2. **Performance**: Updates render smoothly (< 100ms for < 50 nodes)
3. **Usability**: Users can understand conversation structure at a glance
4. **Reliability**: No crashes or errors during long conversations
5. **Visual Appeal**: Clean, professional, intuitive visualization

---

## Future Enhancements (Out of Scope)

- Export mindmap as image/PDF
- Collaborative mindmaps (multiple users)
- Mindmap templates for different conversation types
- AI-suggested connections between concepts
- Timeline view (show mindmap evolution over time)
- Search/filter nodes by keyword
- Custom node styling based on importance

---

## Dependencies

- **Visualization Library**: vis-network (or D3.js, Cytoscape.js)
- **LLM**: Existing LLM infrastructure (no new dependencies)
- **Database**: Existing SQLite/Firebase setup

---

## Decisions Made

1. **Mindmap Structure**: ✅ **Hybrid** (hierarchical topics + concept network)
2. **Update Strategy**: ✅ **Smart Incremental** (merge similar nodes, update relationships)
3. **Visualization Library**: ✅ **D3.js** (most powerful, flexible)
4. **LLM Integration**: ✅ **Incremental Updates** (generate only new nodes/edges)
5. **Data Persistence**: ✅ **Summaries Table** (add `mindmap_json` column)
6. **Interactivity**: ✅ **Clickable Nodes** (expand to show more detail nodes)
7. **Update Frequency**: ✅ **Every 1 minute** (time-based), **No node limit**

---

**Status**: 🟢 Ready for Implementation

**Last Updated**: 2025-01-XX

**Author**: AI Assistant

**Next Steps**: 
1. Gather answers to clarifying questions
2. Finalize technical specification
3. Begin Phase 1 implementation
4. Write comprehensive tests

