const { getFirestore } = require('../../common/services/firebaseClient');
const { createEncryptedConverter } = require('../../common/repositories/firestoreConverter');

const READ_CONTENT_COLLECTION = 'read_content';

function create({ uid, sessionId, url, title, htmlContent }) {
    const db = getFirestore();
    const readId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const readData = {
        id: readId,
        session_id: sessionId,
        url: url || '',
        title: title || '',
        html_content: htmlContent || '',
        read_at: now,
        created_at: now,
        sync_state: 'clean'
    };

    const docRef = db.collection(READ_CONTENT_COLLECTION).doc(readId);
    const converter = createEncryptedConverter(['html_content', 'title', 'url']);
    
    return docRef.withConverter(converter).set(readData).then(() => {
        console.log(`Firebase: Created read content ${readId} for session ${sessionId}`);
        return { id: readId };
    }).catch((err) => {
        console.error('Firebase: Failed to create read content:', err);
        throw err;
    });
}

async function getLatestBySessionId(sessionId) {
    const db = getFirestore();
    const converter = createEncryptedConverter(['html_content', 'title', 'url']);
    
    const snapshot = await db.collection(READ_CONTENT_COLLECTION)
        .where('session_id', '==', sessionId)
        .orderBy('read_at', 'desc')
        .limit(1)
        .withConverter(converter)
        .get();
    
    if (snapshot.empty) {
        return null;
    }
    
    return snapshot.docs[0].data();
}

async function getAllBySessionId(sessionId) {
    const db = getFirestore();
    const converter = createEncryptedConverter(['html_content', 'title', 'url']);
    
    const snapshot = await db.collection(READ_CONTENT_COLLECTION)
        .where('session_id', '==', sessionId)
        .orderBy('read_at', 'desc')
        .withConverter(converter)
        .get();
    
    return snapshot.docs.map(doc => doc.data());
}

async function getById(id) {
    const db = getFirestore();
    const converter = createEncryptedConverter(['html_content', 'title', 'url']);
    
    const doc = await db.collection(READ_CONTENT_COLLECTION)
        .doc(id)
        .withConverter(converter)
        .get();
    
    if (!doc.exists) {
        return null;
    }
    
    return doc.data();
}

module.exports = {
    create,
    getLatestBySessionId,
    getAllBySessionId,
    getById
};

