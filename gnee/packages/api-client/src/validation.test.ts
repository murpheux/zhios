import { guessAddressNetworks, isAddressForNetwork, validateSendForm } from "./validation";
import type { Network } from "./types";

const ADDRESSES: Record<string, { address: string; network: Network }> = {
  mainnetBech32: { address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", network: "MAINNET" },
  mainnetBech32Upper: { address: "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ", network: "MAINNET" },
  mainnetP2pkh: { address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", network: "MAINNET" },
  mainnetP2sh: { address: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", network: "MAINNET" },
  testnetBech32: { address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", network: "TESTNET" },
  testnetP2pkh: { address: "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", network: "TESTNET" },
  testnetP2sh: { address: "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc", network: "TESTNET" },
  regtestBech32: { address: "bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw", network: "REGTEST" },
  regtestP2pkh: { address: "n1LKejAadN6hg2FrBXoU1KrwX4uK16mco9", network: "REGTEST" },
};

const valid = (network: Network, address: string, extra: Partial<Parameters<typeof validateSendForm>[0]> = {}) =>
  validateSendForm({ destinationAddress: address, amountSats: "15000", feeRate: "8", network, ...extra });

describe("isAddressForNetwork", () => {
  it.each(Object.entries(ADDRESSES))("accepts %s on its own network", (_name, { address, network }) => {
    expect(isAddressForNetwork(address, network)).toBe(true);
  });

  it.each([
    ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "TESTNET"],
    ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "REGTEST"],
    ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "MAINNET"],
    ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "REGTEST"],
    ["bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw", "MAINNET"],
    ["bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw", "TESTNET"],
    ["1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "TESTNET"],
    ["mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn", "MAINNET"],
    ["2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc", "MAINNET"],
    ["3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "REGTEST"],
  ] as const)("rejects %s on %s (wrong network prefix)", (address, network) => {
    expect(isAddressForNetwork(address, network)).toBe(false);
  });

  it.each([
    "",
    "hello",
    "tb1qW508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", // mixed case
    "tb1qb", // too short
    "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsb", // 'b' isn't in the bech32 charset
    "xb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", // unknown hrp
    "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN0", // '0' not in base58
  ])("rejects malformed %j", (address) => {
    expect(isAddressForNetwork(address, "TESTNET")).toBe(false);
    expect(isAddressForNetwork(address, "MAINNET")).toBe(false);
  });

  it("guesses the network(s) an address belongs to", () => {
    expect(guessAddressNetworks("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toEqual(["MAINNET"]);
    expect(guessAddressNetworks("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn")).toEqual(["TESTNET", "REGTEST"]);
  });
});

describe("validateSendForm", () => {
  it.each(Object.entries(ADDRESSES))("is valid for %s", (_name, { address, network }) => {
    expect(valid(network, address)).toEqual({ valid: true, errors: {} });
  });

  it("explains a wrong-network address", () => {
    const result = valid("TESTNET", ADDRESSES.mainnetBech32.address);
    expect(result.valid).toBe(false);
    expect(result.errors.destinationAddress).toMatch(/mainnet address.*testnet/);
  });

  it("requires a destination address", () => {
    expect(valid("TESTNET", "   ").errors.destinationAddress).toBe("Enter a destination address.");
  });

  it("trims the address before checking", () => {
    expect(valid("TESTNET", `  ${ADDRESSES.testnetBech32.address}  `).valid).toBe(true);
  });

  it.each([
    [null, "Enter a valid amount."],
    ["", "Enter a valid amount."],
    ["1.5", "Enter a valid amount."],
    ["-1", "Enter a valid amount."],
    ["0", "Amount must be greater than zero."],
  ])("rejects amountSats %j", (amountSats, message) => {
    expect(valid("TESTNET", ADDRESSES.testnetBech32.address, { amountSats }).errors.amount).toBe(message);
  });

  it.each([
    ["15000", "15000", undefined],
    ["15000", "15001", undefined],
    ["15001", "15000", "Amount exceeds the wallet balance."],
  ])("amount %s vs balance %s", (amountSats, balanceSats, expected) => {
    expect(
      valid("TESTNET", ADDRESSES.testnetBech32.address, { amountSats, balanceSats }).errors.amount
    ).toBe(expected);
  });

  it("skips the balance check when no balance is provided", () => {
    expect(valid("TESTNET", ADDRESSES.testnetBech32.address, { amountSats: "2100000000000000" }).valid).toBe(true);
  });

  it.each([
    ["1", true],
    ["10000", true],
    ["0", false],
    ["10001", false],
    ["-5", false],
    ["1.5", false],
    ["08", false],
    ["", false],
    ["abc", false],
  ])("feeRate %j valid=%s", (feeRate, ok) => {
    const result = valid("TESTNET", ADDRESSES.testnetBech32.address, { feeRate });
    expect(result.errors.feeRate === undefined).toBe(ok);
  });
});
