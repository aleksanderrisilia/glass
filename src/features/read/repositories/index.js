const sqliteRepository = require('./sqlite.repository');
const firebaseRepository = require('./firebase.repository');
const authService = require('../../common/services/authService');

function getBaseRepository() {
    const user = authService.getCurrentUser();
    if (user && user.isLoggedIn) {
        return firebaseRepository;
    }
    return sqliteRepository;
}

// The adapter layer that injects the UID
const readRepositoryAdapter = {
    create: ({ sessionId, url, title, htmlContent }) => {
        const uid = authService.getCurrentUserId();
        return getBaseRepository().create({ uid, sessionId, url, title, htmlContent });
    },
    getLatestBySessionId: (sessionId) => {
        return getBaseRepository().getLatestBySessionId(sessionId);
    },
    getAllBySessionId: (sessionId) => {
        return getBaseRepository().getAllBySessionId(sessionId);
    },
    getById: (id) => {
        return getBaseRepository().getById(id);
    }
};

module.exports = readRepositoryAdapter;

