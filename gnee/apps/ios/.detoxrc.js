/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { config: "e2e/jest.config.js" },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    "ios.debug": {
      type: "ios.app",
      // Built by `npm run e2e:build` after `expo prebuild` has generated ./ios.
      binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/ZumaWallet.app",
      build:
        "xcodebuild -workspace ios/ZumaWallet.xcworkspace -scheme ZumaWallet -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: { type: "iPhone 16" },
    },
  },
  configurations: {
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.debug",
    },
  },
};
