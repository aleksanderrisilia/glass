const { collection, doc, setDoc, getDoc, Timestamp } = require('firebase/firestore');
const { getFirestoreInstance } = require('../../../common/services/firebaseClient');
const { createEncryptedConverter } = require('../../../common/repositories/firestoreConverter');
const encryptionService = require('../../../common/services/encryptionService');

const fieldsToEncrypt = ['tldr', 'text', 'bullet_json', 'action_json', 'mindmap_json'];
const summaryConverter = createEncryptedConverter(fieldsToEncrypt);

function summaryDocRef(sessionId) {
    if (!sessionId) throw new Error("Session ID is required to access summary.");
    const db = getFirestoreInstance();
    // Reverting to the original structure with 'data' as the document ID.
    const docPath = `sessions/${sessionId}/summary/data`;
    return doc(db, docPath).withConverter(summaryConverter);
}

async function saveSummary({ uid, sessionId, tldr, text, bullet_json, action_json, mindmap_json, model = 'unknown', generated_at, updated_at }) {
    const now = Timestamp.now();
    const genAt = generated_at || now;
    const updAt = updated_at || now;
    const summaryData = {
        uid, // To know who generated the summary
        session_id: sessionId,
        generated_at: genAt instanceof Timestamp ? genAt : Timestamp.fromMillis(typeof genAt === 'number' ? genAt * 1000 : Date.now()),
        model,
        text: text || '',
        tldr: tldr || '',
        bullet_json: bullet_json || '',
        action_json: action_json || '',
        mindmap_json: mindmap_json || '',
        updated_at: updAt instanceof Timestamp ? updAt : Timestamp.fromMillis(typeof updAt === 'number' ? updAt * 1000 : Date.now()),
    };
    
    // The converter attached to summaryDocRef will handle encryption via its `toFirestore` method.
    // Manual encryption was removed to fix the double-encryption bug.
    const docRef = summaryDocRef(sessionId);
    await setDoc(docRef, summaryData, { merge: true });

    return { changes: 1 };
}

async function getSummaryBySessionId(sessionId) {
    const docRef = summaryDocRef(sessionId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
}

module.exports = {
    saveSummary,
    getSummaryBySessionId,
}; 