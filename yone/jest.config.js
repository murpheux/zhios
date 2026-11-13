/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Small repo: the crawler is fast enough, and watchman is unavailable in sandboxed/CI shells.
  watchman: false,
  rootDir: '.',
  // src is a root so coverage also reports files no test imports.
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Exclude node_modules except light-my-request and cookie which need transformation
  transformIgnorePatterns: [
    'node_modules/(?!(light-my-request|cookie)/)',
  ],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Floor of the measured unit coverage; raise as coverage grows, never lower.
  coverageThreshold: {
    global: { statements: 90, branches: 80, functions: 90, lines: 90 },
  },
};
