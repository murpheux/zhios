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
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  moduleNameMapper: {
    '^@zuma/shared-([a-z]+)$': '<rootDir>/../$1/src',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.d.ts'],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Floor of the measured unit coverage; raise as coverage grows, never lower.
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
