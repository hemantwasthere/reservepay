import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readWalletSession,
  rememberWallet,
  walletSessionKey,
} from "../src/lib/wallet-session";

afterEach(() => vi.unstubAllGlobals());

describe("wallet connection preference", () => {
  it("remembers the selection and forgets it on disconnect", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const selected = { name: "Phantom", address: "selected-account" };
    rememberWallet(selected);
    expect(readWalletSession()).toEqual(selected);
    rememberWallet(null);
    expect(readWalletSession()).toBeNull();
    expect(data.has(walletSessionKey)).toBe(false);
  });

  it.each([
    "broken",
    "null",
    "[]",
    '{"name":"Phantom"}',
    '{"name":true,"address":123}',
  ])("ignores malformed stored preferences: %s", (value) => {
    vi.stubGlobal("localStorage", { getItem: () => value });
    expect(readWalletSession()).toBeNull();
  });

  it("keeps the wallet usable when browser storage is blocked", () => {
    const blocked = () => {
      throw new Error("Storage unavailable");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(readWalletSession()).toBeNull();
    expect(() =>
      rememberWallet({ name: "Phantom", address: "account" }),
    ).not.toThrow();
    expect(() => rememberWallet(null)).not.toThrow();
  });
});
