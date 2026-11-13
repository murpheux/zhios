/** @type {import('jest').Config} */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  watchPathIgnorePatterns: ['/node_modules/', '/.git/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: true,
    }]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@scalar|light-my-request|cookie|@fastify|fastify)/)',
  ],
  moduleNameMapper: {
    '^@scalar/fastify-api-reference$': '<rootDir>/__mocks__/@scalar/fastify-api-reference.js',
  },
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testPathIgnorePatterns: ['tests/unit/api.test.ts'], // Skip API tests; test routes manually with Docker
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    },
  ],
};
