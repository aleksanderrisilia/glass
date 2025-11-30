const sqliteClient = require('../../common/services/sqliteClient');

function create({ uid, sessionId, url, title, htmlContent }) {
    // uid is ignored in the SQLite implementation
    const db = sqliteClient.getDb();
    const readId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO read_content (id, session_id, url, title, html_content, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    try {
        db.prepare(query).run(readId, sessionId, url, title, htmlContent, now, now);
        console.log(`SQLite: Created read content ${readId} for session ${sessionId}`);
        return { id: readId };
    } catch (err) {
        console.error('SQLite: Failed to create read content:', err);
        throw err;
    }
}

function getLatestBySessionId(sessionId) {
    const db = sqliteClient.getDb();
    const query = "SELECT * FROM read_content WHERE session_id = ? ORDER BY read_at DESC LIMIT 1";
    return db.prepare(query).get(sessionId);
}

function getAllBySessionId(sessionId) {
    const db = sqliteClient.getDb();
    const query = "SELECT * FROM read_content WHERE session_id = ? ORDER BY read_at DESC";
    return db.prepare(query).all(sessionId);
}

function getById(id) {
    const db = sqliteClient.getDb();
    return db.prepare('SELECT * FROM read_content WHERE id = ?').get(id);
}

module.exports = {
    create,
    getLatestBySessionId,
    getAllBySessionId,
    getById
};

