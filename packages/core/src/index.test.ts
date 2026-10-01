import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  calculateSettlement,
  merchantAddress,
  orderAddress,
  protocolAddress,
  referenceFromString,
  reservePosition,
} from "./index";

describe("settlement", () => {
  it("splits a protected payment without losing a base unit", () => {
    expect(calculateSettlement(100_000_001n, 500)).toEqual({
      amount: 100_000_001n,
      merchantAmount: 95_000_000n,
      reserveAmount: 5_000_001n,
      reserveBps: 500,
    });
  });

  it("rejects invalid amounts and rates", () => {
    expect(() => calculateSettlement(0n, 500)).toThrow(RangeError);
    expect(() => calculateSettlement(1n, 10_001)).toThrow(RangeError);
  });
});

describe("reserve position", () => {
  it("reports locked coverage and withdrawable funds", () => {
    expect(reservePosition(125_000_000n, 100_000_000n)).toEqual({
      balance: 125_000_000n,
      lockedLiability: 100_000_000n,
      available: 25_000_000n,
      coverageBps: 12_500,
    });
  });
});

describe("program addresses", () => {
  it("derives stable protocol, merchant, and order addresses", () => {
    const authority = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const merchant = merchantAddress(authority, mint);
    const reference = referenceFromString("order-1042");

    expect(protocolAddress().toBase58()).toHaveLength(44);
    expect(merchantAddress(authority, mint).equals(merchant)).toBe(true);
    expect(
      orderAddress(merchant, reference).equals(
        orderAddress(merchant, reference),
      ),
    ).toBe(true);
  });
});
