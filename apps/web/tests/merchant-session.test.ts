import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  merchantSessionKey,
  readSession,
  rememberSession,
} from "../src/lib/merchant-session";

const alice = "alice-wallet-address";
const bob = "bob-wallet-address";
const session = { token: "ab".repeat(32), expiresAt: Date.now() + 60_000 };

afterEach(() => vi.unstubAllGlobals());

const storage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
};

describe("merchant sign-in sessions", () => {
  it("keeps a separate session per wallet", () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    rememberSession(alice, session);
    rememberSession(bob, { ...session, token: "cd".repeat(32) });
    expect(readSession(alice)?.token).toBe(session.token);
    expect(readSession(bob)?.token).toBe("cd".repeat(32));
    clearSession(alice);
    expect(readSession(alice)).toBeNull();
    expect(local.data.has(merchantSessionKey(alice))).toBe(false);
    expect(readSession(bob)?.token).toBe("cd".repeat(32));
  });
  it("treats expired sessions as absent", () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    rememberSession(alice, { ...session, expiresAt: Date.now() - 1 });
    expect(readSession(alice)).toBeNull();
  });
  it.each([
    "broken",
    "null",
    "[]",
    '{"token":"not-hex","expiresAt":9999999999999}',
    '{"token":"' + "ab".repeat(32) + '","expiresAt":"soon"}',
  ])("ignores malformed stored sessions: %s", (value) => {
    vi.stubGlobal("localStorage", { getItem: () => value });
    expect(readSession(alice)).toBeNull();
  });
  it("keeps working when browser storage is blocked", () => {
    const blocked = () => {
      throw new Error("Storage unavailable");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(readSession(alice)).toBeNull();
    expect(() => rememberSession(alice, session)).not.toThrow();
    expect(() => clearSession(alice)).not.toThrow();
  });
});
