const { device, element, by, expect: detoxExpect } = require("detox");

describe("Wallet list", () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("shows the Wallets screen on launch", async () => {
    await detoxExpect(element(by.text("Wallets"))).toBeVisible();
  });

  it("navigates to the create-wallet screen", async () => {
    await element(by.text("+ New")).tap();
    await detoxExpect(element(by.text("Create wallet"))).toBeVisible();
  });
});
