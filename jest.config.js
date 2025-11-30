module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/__tests__/**',
        '!src/**/*.test.js'
    ],
    coverageDirectory: 'coverage',
    verbose: true,
    testTimeout: 30000
};

