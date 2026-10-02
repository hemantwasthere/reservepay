import { describe, expect, it, vi } from "vitest";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  exactAmount,
  merchantClient,
  parseAmount,
  PROGRAM_ID,
  type ReserveAction,
} from "../src/merchant/client";
import type { Reservepay } from "../src/merchant/reservepay";
import idl from "../src/merchant/reservepay.json";
import { orderStatus } from "../src/payments/order-status";
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
    const changed = Transaction.from(
      original.serialize({ requireAllSignatures: false }),
    );
    changed.instructions[0] = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: recipient,
      lamports: 2,
    });
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

describe("wallet priority fees", () => {
  it.each<ReserveAction>(["register", "fund", "withdraw"])(
    "preserves the prepared %s transaction through automatic wallet fee handling",
    async (action) => {
      const signer = Keypair.generate();
      const getFeeForMessage = vi.fn(async () => ({ value: 5200 }));
      const connection = {
        getLatestBlockhash: vi.fn(async () => ({
          blockhash: Keypair.generate().publicKey.toBase58(),
          lastValidBlockHeight: 100,
        })),
        getFeeForMessage,
        getMinimumBalanceForRentExemption: vi.fn(async () => 1_000_000),
        getAccountInfo: vi.fn(async () => null),
      } as unknown as Connection;
      const client = merchantClient(connection);
      vi.spyOn(client, "read").mockResolvedValue({
        ready: true,
        registered: action !== "register",
        merchant: "",
        vault: "",
        reserveBps: 500,
        reserve: 20_000_000n,
        locked: 0n,
        walletBalance: 20_000_000n,
        lamports: 1_000_000_000,
        completedOrders: 0n,
        refundedOrders: 0n,
        volume: 0n,
        slot: 1,
      });
      const { transaction } = await client.prepare(
        signer.publicKey,
        action,
        1_000_000n,
      );
      const walletTransaction = Transaction.from(
        transaction.serialize({ requireAllSignatures: false }),
      );
      if (
        !walletTransaction.instructions.some((instruction) =>
          instruction.programId.equals(ComputeBudgetProgram.programId),
        )
      ) {
        walletTransaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 375_000 }),
        );
      }
      walletTransaction.sign(signer);
      expect(
        validateSignedTransaction(transaction, walletTransaction.serialize())
          .signature,
      ).toBeTruthy();
      expect(getFeeForMessage).toHaveBeenCalledWith(
        transaction.compileMessage(),
        "confirmed",
      );
    },
  );
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

describe("on-chain order status", () => {
  it("maps the chain variants to merchant-facing statuses", () => {
    expect(orderStatus({ open: {} })).toBe("paid");
    expect(orderStatus({ completed: {} })).toBe("completed");
    expect(orderStatus({ refunded: {} })).toBe("refunded");
  });
});

describe("merchant order reads", () => {
  const authority = Keypair.generate().publicKey;
  const buyer = Keypair.generate().publicKey;
  const orderAccount = (overrides: {
    reference: number[];
    amount: number;
    reserveAmount: number;
    createdAt: number;
    expiresAt: number;
    status: { open: object } | { completed: object } | { refunded: object };
  }) => ({
    merchant: PublicKey.default,
    buyer,
    buyerTokenAccount: Keypair.generate().publicKey,
    bump: 255,
    ...overrides,
    amount: new BN(overrides.amount),
    reserveAmount: new BN(overrides.reserveAmount),
    createdAt: new BN(overrides.createdAt),
    expiresAt: new BN(overrides.expiresAt),
  });
  const clientWithOrders = async (
    orders: ReturnType<typeof orderAccount>[],
  ) => {
    const connection = {
      getProgramAccounts: vi.fn(async () => []),
    } as unknown as Connection;
    const program = new Program<Reservepay>(idl as Reservepay, { connection });
    const encoded = await Promise.all(
      orders.map(async (order) => ({
        pubkey: Keypair.generate().publicKey,
        account: {
          data: await program.coder.accounts.encode("order", order),
          executable: false,
          lamports: 1_000_000,
          owner: PROGRAM_ID,
          rentEpoch: 0,
        },
      })),
    );
    vi.mocked(connection.getProgramAccounts).mockResolvedValue(encoded);
    return merchantClient(connection);
  };
  const base = {
    reference: Array(16).fill(0xab),
    amount: 1_000_000,
    reserveAmount: 50_000,
    createdAt: 1_000,
    expiresAt: 87_400,
    status: { open: {} },
  };

  it("decodes orders with open ones first by expiry and maps statuses", async () => {
    const client = await clientWithOrders([
      orderAccount({ ...base, status: { completed: {} } }),
      orderAccount({ ...base, expiresAt: 90_000 }),
      orderAccount(base),
      orderAccount({ ...base, status: { refunded: {} } }),
    ]);
    const { orders, mismatch } = await client.readOrders(authority, 2_000_000n);
    expect(orders.map((order) => order.status)).toEqual([
      "paid",
      "paid",
      "completed",
      "refunded",
    ]);
    expect(orders[0].expiresAt).toBe(87_400_000);
    expect(orders[1].expiresAt).toBe(90_000_000);
    expect(orders[0].reference).toBe("ab".repeat(16));
    expect(orders[0].buyer).toBe(buyer.toBase58());
    expect(orders[0].amount).toBe(1_000_000n);
    expect(orders[0].reserveAmount).toBe(50_000n);
    expect(mismatch).toBe(false);
  });
  it("flags a mismatch when open orders do not cover the locked reserve", async () => {
    const client = await clientWithOrders([orderAccount(base)]);
    expect((await client.readOrders(authority, 1_000_000n)).mismatch).toBe(
      false,
    );
    expect((await client.readOrders(authority, 500_000n)).mismatch).toBe(true);
    expect((await client.readOrders(authority)).mismatch).toBe(false);
  });
  it("reads an empty order book", async () => {
    const client = await clientWithOrders([]);
    expect(await client.readOrders(authority, 0n)).toEqual({
      orders: [],
      mismatch: false,
    });
  });
});
