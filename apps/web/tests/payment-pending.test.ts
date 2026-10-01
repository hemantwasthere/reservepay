import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  clearPayment,
  loadPayment,
  savePayment,
} from "../src/payments/pending";
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
}
const pending = {
  signature: bs58.encode(new Uint8Array(64).fill(1)),
  lastValidBlockHeight: 100,
  buyer: Keypair.generate().publicKey.toBase58(),
};
describe("checkout recovery journal", () => {
  it("recovers signed payments after reload and isolates links", () => {
    storage();
    savePayment("one", pending);
    expect(loadPayment("one")).toEqual(pending);
    expect(loadPayment("two")).toBeNull();
    clearPayment("one");
    expect(loadPayment("one")).toBeNull();
  });
  it("fails closed on corrupt storage and unavailable persistence", () => {
    storage();
    localStorage.setItem("reservepay:devnet:checkout:one", "broken");
    expect(() => loadPayment("one")).toThrow();
    savePayment("one", { ...pending, lastValidBlockHeight: -1 });
    expect(() => loadPayment("one")).toThrow("could not be read");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    });
    expect(() => savePayment("one", pending)).toThrow("Quota exceeded");
  });
});
