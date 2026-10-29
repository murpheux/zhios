/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/*.test.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  watchman: false,
};
