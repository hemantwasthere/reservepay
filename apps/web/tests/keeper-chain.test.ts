import { describe, expect, it, vi } from "vitest";
import { Keypair, type Connection } from "@solana/web3.js";
import { keeperChain, programError } from "../src/payments/keeper-chain";

function rpcWith(err: unknown) {
  return {
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 100,
    })),
    sendRawTransaction: vi.fn(async () => "signature"),
    confirmTransaction: vi.fn(async () => ({ value: { err } })),
  } as unknown as Connection;
}

describe("keeperChain.send", () => {
  it("rejects a confirmed-but-failed transaction and names the program error", async () => {
    const chain = keeperChain(
      rpcWith({ InstructionError: [0, { Custom: 6005 }] }),
    );
    await expect(chain.send([], Keypair.generate())).rejects.toThrow(
      /OrderClosed/,
    );
  });
  it("rejects with the raw error for failures outside the IDL", async () => {
    const chain = keeperChain(rpcWith("AccountInUse"));
    await expect(chain.send([], Keypair.generate())).rejects.toThrow(
      /Release transaction failed/,
    );
  });
  it("resolves the signature when confirmation succeeds", async () => {
    const chain = keeperChain(rpcWith(null));
    await expect(chain.send([], Keypair.generate())).resolves.toBe(
      "signature",
    );
  });
});

describe("programError", () => {
  it("names known custom program errors and ignores the rest", () => {
    expect(programError({ InstructionError: [1, { Custom: 6004 }] })).toBe(
      "OrderStillProtected",
    );
    expect(programError({ InstructionError: [1, { Custom: 6007 }] })).toBe(
      "DisputeWindowClosed",
    );
    expect(programError({ InstructionError: [1, { Custom: 6008 }] })).toBe(
      "OrderUnderDispute",
    );
    expect(programError({ InstructionError: [1, { Custom: 9999 }] })).toBeNull();
    expect(programError({ InstructionError: [1, "Other"] })).toBeNull();
    expect(programError(null)).toBeNull();
  });
});
