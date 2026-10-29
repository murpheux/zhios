/** @type {import('jest').Config} */
module.exports = {
  preset: "react-native",
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["@testing-library/react-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context)/)",
  ],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  watchman: false,
};
