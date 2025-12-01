# Feature: Live Insight Context

## Overview

**Vision Statement**: When Glass is actively listening, the live conversation transcript becomes the primary context for Ask. This creates a seamless, real-time intelligence experience where questions are answered based on what's happening *right now* in the conversation, not stale data from the database.

**Design Philosophy**: Think different. Simplicity. The user shouldn't think about context—it should just work. When they're in a meeting and ask a question, Glass should understand the conversation happening *now*, not what happened yesterday.

---

## Problem Statement

Currently, the Ask feature uses context in this priority order:
1. Read content (Chrome tab/PDF/Word) if recent (< 5 minutes)
2. Conversation history from previous Ask interactions
3. Screenshot as fallback

**The Gap**: When a user is actively listening to a live conversation (meeting, call, etc.), the real-time transcripts are stored in the database but are **not** used as context for Ask. This means:
- Users ask questions about the current conversation, but Glass references old data
- The most relevant context (the live transcript) is ignored
- The experience feels disconnected and unresponsive

---

## Solution: Live Transcript Context Override

### Core Behavior

**When transcripts exist from the active session:**
- Live transcripts **completely override** all other context sources (read content, conversation history, screenshots)
- Ask questions are answered based on the conversation transcript from the current session
- Works even if listening has stopped (uses all transcripts from the session)
- **Exception**: If listening stopped AND a read action is triggered, read content overrides transcripts

**When no transcripts exist:**
- Fall back to existing behavior (read content → conversation history → screenshot)
- Seamless, no user intervention needed

**Real-Time Updates:**
- If new transcripts arrive while Ask is processing, context is updated dynamically
- Ensures the most current conversation state is always used

### Key Principles

1. **Simplicity First**: One rule—if listening, use transcripts. That's it.
2. **Real-Time Intelligence**: The context is always "now", not "then"
3. **Zero Configuration**: Works automatically, no settings needed
4. **Performance**: Fast, efficient, no unnecessary processing

---

## Technical Specification

### 1. Context Resolution Logic

```
IF (transcripts exist for active listen session):
    context = formatTranscripts(getAllTranscriptsBySessionId(listenSessionId))
    priority = "live_transcript"
    // Check for read content override: if listening stopped AND read triggered, use read content
ELSE:
    context = existingContextResolution() // Current behavior
    priority = "fallback"
```

**Session Detection:**
- Get active listen session ID from `listenService.getCurrentSessionId()`
- Use transcripts from this session, even if listening has stopped
- Only use transcripts from the active session (not other sessions)

### 2. Transcript Formatting

**Format**: Timestamped conversation with speaker labels
```
[HH:MM:SS] You: [text]
[HH:MM:SS] Speaker: [text]
...
```

**Speaker Labels**:
- `me` → "You"
- `them` → "Speaker" (or detect actual speaker name if available)

**Timestamp Format**:
- Convert `start_at` (Unix timestamp in seconds) to `HH:MM:SS` format
- Use local timezone

**Example Output**:
```
[14:23:15] You: Can you explain the quarterly results?
[14:23:28] Speaker: Sure, our Q4 revenue increased by 23% compared to last year.
[14:23:45] You: What about the profit margins?
[14:24:02] Speaker: Profit margins improved to 18%, up from 15% in Q3.
```

### 3. Session Management

**Active Session Detection**:
- Get the current active listen session ID from `listenService.getCurrentSessionId()`
- Use transcripts from this session, regardless of whether listening is currently active
- Only use transcripts from the active session (not other sessions)

**Read Content Override**:
- If listening has stopped AND a read action is triggered (Chrome tab/PDF/Word)
- Read content takes priority over transcripts
- This allows users to switch context by reading new content

### 4. Implementation Details

#### Modified Files

**`src/features/ask/askService.js`**:
- Add method: `_getLiveTranscriptContext(sessionId)`
- Modify: `sendMessage()` to check for live transcripts first
- Priority order:
  1. Live transcripts (if listening active)
  2. Read content (if recent)
  3. Conversation history
  4. Screenshot

**`src/features/listen/listenService.js`**:
- Expose: `isSessionActive()` method (if not already)
- Expose: `getCurrentSessionId()` method (if not already)

**`src/features/listen/stt/repositories/index.js`**:
- Already has: `getAllTranscriptsBySessionId(sessionId)`
- No changes needed

#### Code Structure

```javascript
// In askService.js

async _getLiveTranscriptContext(sessionId) {
    // Check if listening is active
    const isListeningActive = await listenService.isSessionActive();
    if (!isListeningActive) {
        return null;
    }
    
    // Get active listen session ID
    const listenSessionId = listenService.getCurrentSessionId();
    if (!listenSessionId) {
        return null;
    }
    
    // Fetch transcripts
    const transcripts = await sttRepository.getAllTranscriptsBySessionId(listenSessionId);
    if (!transcripts || transcripts.length === 0) {
        return null;
    }
    
    // Format transcripts
    return this._formatTranscriptsForContext(transcripts);
}

_formatTranscriptsForContext(transcripts) {
    return transcripts
        .map(t => {
            const speaker = t.speaker === 'me' ? 'You' : 'Speaker';
            return `${speaker}: ${t.text}`;
        })
        .join('\n');
}

// In sendMessage():
async sendMessage(userPrompt, conversationHistoryRaw = []) {
    // ... existing code ...
    
    // PRIORITY 1: Live transcripts (if listening active)
    let liveTranscriptContext = null;
    try {
        liveTranscriptContext = await this._getLiveTranscriptContext(sessionId);
    } catch (error) {
        console.warn('[AskService] Failed to get live transcript context:', error);
    }
    
    // PRIORITY 2: Read content (if no live transcripts)
    let readContent = null;
    if (!liveTranscriptContext) {
        try {
            readContent = await readRepository.getLatestBySessionId(sessionId);
            // ... existing read content logic ...
        } catch (error) {
            console.warn('[AskService] Failed to get read content:', error);
        }
    }
    
    // Build context string
    let contextString = '';
    if (liveTranscriptContext) {
        contextString = `Live Conversation Transcript:\n${liveTranscriptContext}`;
        console.log(`[AskService] Using live transcript context (${liveTranscriptContext.length} chars)`);
    } else if (useReadContent) {
        contextString = `Chrome Tab Content (from ${readContent.url || 'current tab'}):\n${readTextContent}\n\n${conversationHistory}`;
    } else {
        contextString = conversationHistory;
    }
    
    // ... rest of existing code ...
}
```

---

## User Experience

### Scenario 1: Active Listening → Ask Question

1. User starts listening (meeting/call)
2. Transcripts are being captured in real-time
3. User clicks "Ask" and types: "What did they say about the budget?"
4. **Glass responds based on the live transcript**, not old data
5. User gets immediate, relevant answer

### Scenario 2: Not Listening → Ask Question

1. User is not listening
2. User clicks "Ask" and types a question
3. **Glass uses existing behavior** (read content or conversation history)
4. Seamless fallback, no errors

### Scenario 3: Listening Stops → Ask Question

1. User was listening, then stops
2. User clicks "Ask" within a few seconds
3. **Glass uses the most recent transcripts** (still "live" context)
4. After a timeout (e.g., 30 seconds), falls back to normal behavior

---

## Testing Strategy

### Unit Tests

**File**: `src/features/ask/__tests__/liveTranscriptContext.test.js`

```javascript
describe('Live Transcript Context', () => {
    test('should return live transcripts when listening is active', async () => {
        // Mock: listening active, transcripts exist
        // Assert: context is live transcripts
    });
    
    test('should return null when listening is not active', async () => {
        // Mock: listening inactive
        // Assert: returns null, falls back to normal behavior
    });
    
    test('should return null when no transcripts exist', async () => {
        // Mock: listening active, but no transcripts
        // Assert: returns null, falls back to normal behavior
    });
    
    test('should format transcripts correctly', () => {
        // Mock: transcripts with 'me' and 'them' speakers
        // Assert: formatted as "You: ..." and "Speaker: ..."
    });
});
```

### Integration Tests

**File**: `src/features/ask/__tests__/liveTranscriptIntegration.test.js`

```javascript
describe('Live Transcript Integration', () => {
    test('Ask should use live transcripts when listening is active', async () => {
        // 1. Start listening session
        // 2. Add some transcripts
        // 3. Send Ask message
        // 4. Assert: Ask uses transcript context, not read content
    });
    
    test('Ask should fall back to read content when listening is inactive', async () => {
        // 1. Stop listening
        // 2. Add read content
        // 3. Send Ask message
        // 4. Assert: Ask uses read content, not transcripts
    });
    
    test('Ask should handle session promotion correctly', async () => {
        // 1. Active listen session exists
        // 2. Ask creates new 'ask' session
        // 3. Assert: Ask uses listen session's transcripts
    });
});
```

### Manual Testing Checklist

- [ ] Start listening, add transcripts, ask question → uses live transcripts
- [ ] Stop listening, ask question → uses fallback (read content/history)
- [ ] No transcripts, ask question → uses fallback
- [ ] Listening active but empty transcripts → uses fallback
- [ ] Multiple speakers in transcript → formatted correctly
- [ ] Long transcript (100+ turns) → handled efficiently
- [ ] Session switching → transcripts from correct session

---

## Performance Considerations

1. **Caching**: Cache transcript fetch results during a single Ask request
2. **Limiting**: Limit transcript length to last N turns (e.g., 50) to prevent token overflow
3. **Efficiency**: Only fetch transcripts if listening is active (early return)
4. **Async**: All transcript operations are async, non-blocking

---

## Edge Cases

1. **Concurrent Sessions**: If multiple listen sessions exist, use the most recent active one
2. **Session Mismatch**: If Ask session != Listen session, use listen session's transcripts
3. **Empty Transcripts**: If transcripts array is empty, fall back immediately
4. **Very Long Transcripts**: Truncate to last 50 turns or 10,000 characters (whichever is smaller)
5. **Transcript Format Errors**: Handle gracefully, fall back to normal behavior

---

## Future Enhancements (Out of Scope)

- Real-time transcript streaming to Ask window
- Transcript search/highlighting
- Speaker identification and naming
- Transcript summarization before context injection
- Multi-session transcript aggregation

---

## Success Metrics

1. **Accuracy**: Ask responses are more relevant when listening is active
2. **Performance**: No noticeable latency when using live transcripts
3. **Reliability**: Zero errors when switching between listening/not listening
4. **User Satisfaction**: Users report that Ask "understands the conversation"

---

## Implementation Checklist

- [ ] Add `isSessionActive()` and `getCurrentSessionId()` to `listenService`
- [ ] Implement `_getLiveTranscriptContext()` in `askService`
- [ ] Implement `_formatTranscriptsForContext()` in `askService`
- [ ] Modify `sendMessage()` to prioritize live transcripts
- [ ] Add unit tests for transcript context logic
- [ ] Add integration tests for full flow
- [ ] Manual testing with real scenarios
- [ ] Update documentation if needed
- [ ] Code review
- [ ] Deploy and monitor

---

## Notes

- This feature is **opt-in by design** (automatic when listening is active)
- No UI changes required—works seamlessly in the background
- Follows existing architecture patterns (Service-Repository)
- Maintains backward compatibility (fallback to existing behavior)

---

**Status**: ✅ Implemented

**Last Updated**: 2025-01-XX

**Author**: AI Assistant

## Implementation Summary

### Completed Features

1. ✅ **Live Transcript Context Override**: Transcripts completely override all other context sources
2. ✅ **Active Session Detection**: Only uses transcripts from the active listen session
3. ✅ **Read Content Override Logic**: When listening stops, recent read content overrides transcripts
4. ✅ **Timestamp Formatting**: Transcripts formatted with `[HH:MM:SS]` timestamps and speaker labels
5. ✅ **Real-Time Polling**: Polls for new transcripts before sending request to LLM
6. ✅ **Comprehensive Testing**: Unit and integration tests written and passing

### Key Implementation Details

- **Method Added**: `getCurrentSessionId()` in `listenService`
- **Methods Added in `askService`**:
  - `_formatTimestamp()` - Formats Unix timestamps to HH:MM:SS
  - `_formatTranscriptsForContext()` - Formats transcripts with timestamps and speaker labels
  - `_getLiveTranscriptContext()` - Fetches and formats live transcripts
  - `_pollForNewTranscripts()` - Polls for new transcripts during processing
- **Modified**: `sendMessage()` - Now prioritizes live transcripts over all other context

### Testing

- **Unit Tests**: `src/features/ask/__tests__/liveTranscriptContext.test.js`
- **Integration Tests**: `src/features/ask/__tests__/liveTranscriptIntegration.test.js`

Run tests with: `npm test`

