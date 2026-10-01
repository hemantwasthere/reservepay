import { describe, expect, it, vi } from "vitest";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { exactAmount, parseAmount } from "../src/merchant/client";
import {
  transactionResult,
  validateSignedTransaction,
  type PendingTransaction,
} from "../src/merchant/transactions";

const pending: PendingTransaction = {
  signature: "test-signature",
  lastValidBlockHeight: 100,
  address: "test-wallet",
  action: "fund",
  amount: "1000000",
  createdAt: 0,
};
const rpc = (statuses: unknown[], height = 90) => {
  const getSignatureStatuses = vi.fn();
  statuses.forEach((status) =>
    getSignatureStatuses.mockResolvedValueOnce({ value: [status] }),
  );
  return {
    getSignatureStatuses,
    getBlockHeight: vi.fn(async () => height),
  } as unknown as Connection;
};

describe("reserve amounts", () => {
  it("preserves all six decimals and large u64 values without floating point", () => {
    expect(parseAmount("1234567890123.000001")).toBe(1234567890123000001n);
    expect(parseAmount("18446744073709.551615")).toBe(18446744073709551615n);
    expect(exactAmount(1000001n)).toBe("1.000001");
    expect(exactAmount(1000000n)).toBe("1");
    expect(exactAmount(1n)).toBe("0.000001");
  });
  it("rejects zero, negatives, overflow, ambiguous syntax and excess precision", () => {
    for (const value of [
      "0",
      "-1",
      "1e6",
      " 1",
      "1,000",
      ".1",
      "1.",
      "1.0000001",
      "18446744073709.551616",
      "Infinity",
      "",
    ])
      expect(() => parseAmount(value)).toThrow();
  });
});

describe("signed reserve transactions", () => {
  const signer = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const transaction = () =>
    new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipient,
        lamports: 1,
      }),
    );
  it("accepts a valid signature for the exact transaction", () => {
    const tx = transaction();
    tx.sign(signer);
    expect(
      validateSignedTransaction(tx, tx.serialize()).signature,
    ).toBeTruthy();
  });
  it("rejects a signed transaction whose transfer was changed", () => {
    const original = transaction();
    const changed = transaction();
    changed.sign(signer);
    expect(() =>
      validateSignedTransaction(original, changed.serialize()),
    ).toThrow("different or invalid");
  });
  it("rejects unsigned wallet responses", () => {
    const tx = transaction();
    expect(() =>
      validateSignedTransaction(
        tx,
        tx.serialize({ requireAllSignatures: false }),
      ),
    ).toThrow();
  });
});

describe("transaction recovery", () => {
  it("does not call processed or missing transactions confirmed", async () => {
    expect(
      await transactionResult(
        rpc([{ err: null, confirmationStatus: "processed" }]),
        pending,
      ),
    ).toBe("pending");
    expect(await transactionResult(rpc([null]), pending)).toBe("pending");
  });
  it("recognizes confirmed success and on-chain failure", async () => {
    expect(
      await transactionResult(
        rpc([{ err: null, confirmationStatus: "confirmed" }]),
        pending,
      ),
    ).toBe("confirmed");
    expect(
      await transactionResult(
        rpc([{ err: { InstructionError: [0, "error"] } }]),
        pending,
      ),
    ).toBe("failed");
  });
  it("only expires an absent transaction after finalized block height and a second lookup", async () => {
    const expired = rpc([null, null], 101);
    expect(await transactionResult(expired, pending)).toBe("expired");
    expect(expired.getBlockHeight).toHaveBeenCalledWith("finalized");
    expect(expired.getSignatureStatuses).toHaveBeenCalledTimes(2);
    expect(
      await transactionResult(
        rpc([null, { err: null, confirmationStatus: "finalized" }], 101),
        pending,
      ),
    ).toBe("confirmed");
  });
  it("preserves RPC errors so uncertain transfers stay pending", async () => {
    const broken = rpc([]);
    vi.mocked(broken.getSignatureStatuses).mockRejectedValue(
      new Error("RPC unavailable"),
    );
    await expect(transactionResult(broken, pending)).rejects.toThrow(
      "RPC unavailable",
    );
  });
});
