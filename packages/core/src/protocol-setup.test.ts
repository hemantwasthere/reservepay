import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { planProtocolSetup } from "./protocol-setup";

const wallet = Keypair.generate().publicKey.toBase58();
const other = Keypair.generate().publicKey.toBase58();
const resolver = Keypair.generate().publicKey.toBase58();

describe("planProtocolSetup", () => {
  it("initializes with the wallet as resolver by default", () => {
    expect(planProtocolSetup(null, wallet, {})).toEqual({
      action: "init",
      resolver: wallet,
    });
  });
  it("initializes with an explicit resolver", () => {
    expect(planProtocolSetup(null, wallet, { resolver })).toEqual({
      action: "init",
      resolver,
    });
  });
  it("rotates the resolver for the authority", () => {
    const current = { authority: wallet, resolver: other };
    expect(planProtocolSetup(current, wallet, { resolver })).toEqual({
      action: "set-resolver",
      resolver,
    });
  });
  it("is a noop when nothing would change", () => {
    const current = { authority: wallet, resolver };
    expect(planProtocolSetup(current, wallet, {})).toEqual({ action: "noop" });
    expect(planProtocolSetup(current, wallet, { resolver })).toEqual({
      action: "noop",
    });
  });
  it("rejects wallets that are not the protocol authority", () => {
    const current = { authority: other, resolver };
    expect(() => planProtocolSetup(current, wallet, {})).toThrow(
      "Wallet is not the protocol authority",
    );
  });
});
