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
  testPathIgnorePatterns: ['wallet.repository.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  // Resolve @zinga/shared-* to TypeScript sources so tests run without a prior `tsc -b`.
  moduleNameMapper: {
    '^@zinga/shared-([a-z]+)$': '<rootDir>/../../shared/$1/src',
  },
  testTimeout: 30000,
  // Unit-coverage scope. Excluded (need a live PostgreSQL DB / are process entrypoints):
  //   src/infrastructure/persistence/**, src/index.ts
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts', '!src/infrastructure/persistence/**'],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Floor of the measured unit coverage; raise as coverage grows, never lower.
  coverageThreshold: {
    global: { statements: 99, branches: 94, functions: 100, lines: 99 },
  },
};
