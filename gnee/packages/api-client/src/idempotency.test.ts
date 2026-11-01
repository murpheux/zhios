import { createIdempotencyKey } from "./idempotency";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Gateway constraint (zuma/graphql/src/resolvers/transaction.resolvers.ts).
const GATEWAY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

describe("createIdempotencyKey", () => {
  it("returns a v4 UUID accepted by the gateway using the global crypto", () => {
    const key = createIdempotencyKey();
    expect(key).toMatch(UUID_V4);
    expect(key).toMatch(GATEWAY_KEY);
    expect(createIdempotencyKey()).not.toBe(key);
  });

  it("prefers crypto.randomUUID when available", () => {
    const randomUUID = jest.fn(() => "11111111-2222-4333-8444-555555555555");
    expect(createIdempotencyKey({ randomUUID })).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back to getRandomValues and sets the version/variant bits", () => {
    const getRandomValues = jest.fn((array: Uint8Array) => array.fill(0xff));
    const key = createIdempotencyKey({ getRandomValues });
    expect(key).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(key).toMatch(UUID_V4);
  });

  it("throws rather than using Math.random when no secure source exists", () => {
    const spy = jest.spyOn(Math, "random");
    let thrown: unknown;
    try {
      createIdempotencyKey({});
    } catch (err) {
      thrown = err;
    }
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBe(0);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/secure random/);
  });
});
