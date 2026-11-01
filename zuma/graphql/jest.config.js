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
  // Resolve @zuma/shared-* to TypeScript sources so tests run without a prior `tsc -b`.
  moduleNameMapper: {
    '^@zuma/shared-([a-z]+)$': '<rootDir>/../shared/$1/src',
    // mercurius 16 -> @fastify/static 10 require()s the ESM-only content-disposition@3; Jest cannot.
    '^content-disposition$': '<rootDir>/tests/shims/content-disposition.js',
  },
  testTimeout: 30000,
  // Unit-coverage scope. Excluded: src/index.ts (process entrypoint: listen + signal handlers + exit).
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Floor of the measured unit coverage; raise as coverage grows, never lower.
  coverageThreshold: {
    global: { statements: 100, branches: 95, functions: 100, lines: 100 },
  },
};
