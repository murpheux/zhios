import {
  convertAmountInput,
  formatBtc,
  formatSats,
  isSatsString,
  MAX_SUPPLY_SATS,
  parseBtcInputToSats,
  parseSats,
  parseSatsInput,
  satsToBtc,
} from "./sats";

describe("parseBtcInputToSats", () => {
  it.each([
    ["0.00000001", "1"],
    ["21000000", "2100000000000000"],
    ["1", "100000000"],
    ["0.0015", "150000"],
    [".5", "50000000"],
    ["1.", "100000000"],
    ["  0.1  ", "10000000"],
    ["0", "0"],
    ["000.00010000", "10000"],
    ["20999999.99999999", "2099999999999999"],
  ])("parses %j -> %j", (input, expected) => {
    expect(parseBtcInputToSats(input)).toBe(expected);
  });

  it.each([
    "1e-8",
    "-1",
    "0.000000001",
    "abc",
    "",
    ".",
    "1,000",
    "1.2.3",
    "+1",
    "0x10",
    "Infinity",
    "NaN",
    "21000000.00000001",
    "1 000",
  ])("rejects %j", (input) => {
    expect(parseBtcInputToSats(input)).toBeNull();
  });
});

describe("parseSatsInput", () => {
  it.each([
    ["15000", "15000"],
    [" 0015000 ", "15000"],
    ["0", "0"],
  ])("parses %j -> %j", (input, expected) => {
    expect(parseSatsInput(input)).toBe(expected);
  });

  it.each(["1.5", "-1", "1e3", "abc", "", (MAX_SUPPLY_SATS + 1n).toString()])("rejects %j", (input) => {
    expect(parseSatsInput(input)).toBeNull();
  });
});

describe("isSatsString / parseSats", () => {
  it.each([
    ["0", true],
    ["150000", true],
    ["2100000000000000", true],
    ["2100000000000001", false],
    ["01", false],
    ["-1", false],
    ["1.0", false],
    ["", false],
  ])("isSatsString(%j) === %s", (input, expected) => {
    expect(isSatsString(input)).toBe(expected);
  });

  it("parseSats returns a bigint and throws on invalid input", () => {
    expect(parseSats("150000")).toBe(150000n);
    expect(() => parseSats("1.5")).toThrow(RangeError);
  });
});

describe("satsToBtc / formatBtc / formatSats", () => {
  it.each([
    ["0", "0.00000000"],
    ["1", "0.00000001"],
    ["150000", "0.00150000"],
    ["100000000", "1.00000000"],
    ["2100000000000000", "21000000.00000000"],
  ])("satsToBtc(%j) === %j", (input, expected) => {
    expect(satsToBtc(input)).toBe(expected);
  });

  it("handles bigint input including negatives", () => {
    expect(satsToBtc(-150000n)).toBe("-0.00150000");
  });

  it("formats for display and never throws on malformed server values", () => {
    expect(formatBtc("150000")).toBe("0.00150000 BTC");
    expect(formatSats("1234567")).toBe("1,234,567 sats");
    expect(formatBtc("12.5")).toBe("—");
    expect(formatSats("nope")).toBe("—");
  });
});

describe("convertAmountInput", () => {
  it.each([
    ["0.0015", "BTC", "SATS", "150000"],
    ["150000", "SATS", "BTC", "0.0015"],
    ["100000000", "SATS", "BTC", "1"],
    ["1000000000", "SATS", "BTC", "10"],
    ["abc", "BTC", "SATS", "abc"],
    ["5", "BTC", "BTC", "5"],
  ] as const)("%j %s -> %s === %j", (input, from, to, expected) => {
    expect(convertAmountInput(input, from, to)).toBe(expected);
  });
});
