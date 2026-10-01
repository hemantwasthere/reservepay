import { describe, expect, it, vi } from "vitest";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { PROGRAM_ID } from "@reservepay/core";
import { paymentClient } from "../src/payments/chain";
import { referenceBytes, type PaymentTerms } from "../src/payments/terms";
import { validateSignedTransaction } from "../src/merchant/transactions";
import idl from "../src/merchant/reservepay.json";
import type { Reservepay } from "../src/merchant/reservepay";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../src/merchant/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  merchantClient: () => ({ read }),
}));
const seller = Keypair.generate(),
  buyer = Keypair.generate();
const terms: PaymentTerms = {
  merchant: seller.publicKey.toBase58(),
  reference: "ab".repeat(16),
  title: "Test",
  amount: "1000000",
  protectionSeconds: 86400,
  issuedAt: Date.now(),
};
const state = {
  ready: true,
  registered: true,
  reserve: 2_000_000n,
  locked: 0n,
  walletBalance: 2_000_000n,
  lamports: 1e9,
  reserveBps: 500,
};
const rpc = () =>
  ({
    getAccountInfo: vi.fn(async () => null),
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 100,
    })),
    getFeeForMessage: vi.fn(async () => ({ value: 5250 })),
    getMinimumBalanceForRentExemption: vi.fn(async () => 1_000_000),
  }) as unknown as Connection;

describe("real checkout transaction", () => {
  it("builds and validates the actual program transaction with wallet fee instructions", async () => {
    read.mockResolvedValue(state);
    const client = paymentClient(rpc());
    const { transaction } = await client.prepare(terms, buyer.publicKey);
    expect(transaction.instructions).toHaveLength(4);
    expect(transaction.instructions[3].programId.equals(PROGRAM_ID)).toBe(true);
    const signed = Transaction.from(
      transaction.serialize({ requireAllSignatures: false }),
    );
    signed.sign(buyer);
    expect(
      validateSignedTransaction(transaction, signed.serialize()).signature,
    ).toBeTruthy();
  });
  it("refuses self payment, insufficient coverage, USDC and fee funds", async () => {
    await expect(
      paymentClient(rpc()).prepare(terms, seller.publicKey),
    ).rejects.toThrow("different wallet");
    read.mockResolvedValue({ ...state, reserve: 0n });
    await expect(
      paymentClient(rpc()).prepare(terms, buyer.publicKey),
    ).rejects.toThrow("reserve funds");
    read.mockResolvedValue({ ...state, walletBalance: 0n });
    await expect(
      paymentClient(rpc()).prepare(terms, buyer.publicKey),
    ).rejects.toThrow("enough devnet USDC");
    read.mockResolvedValue({ ...state, lamports: 0 });
    await expect(
      paymentClient(rpc()).prepare(terms, buyer.publicKey),
    ).rejects.toThrow("network fee");
  });
  it("verifies account ownership, amount, merchant, reference and protection before accepting receipts", async () => {
    const connection = rpc(),
      client = paymentClient(connection);
    const coder = new Program<Reservepay>(idl as Reservepay, { connection })
      .coder.accounts;
    const order = {
      merchant: client.addresses(terms).merchant,
      buyer: buyer.publicKey,
      buyerTokenAccount: buyer.publicKey,
      reference: Array.from(referenceBytes(terms.reference)),
      amount: new BN(terms.amount),
      reserveAmount: new BN(50000),
      createdAt: new BN(100),
      expiresAt: new BN(86500),
      status: { open: {} },
      bump: 1,
    };
    const account = async (changes = {}, owner = PROGRAM_ID) => ({
      data: await coder.encode("order", { ...order, ...changes }),
      owner,
      executable: false,
      lamports: 1000,
      rentEpoch: 0,
    });
    vi.mocked(connection.getAccountInfo).mockResolvedValue(await account());
    expect(await client.readOrder(terms)).toMatchObject({
      buyer: buyer.publicKey.toBase58(),
      reserveAmount: "50000",
      expiresAt: 86500000,
      status: "paid",
    });
    expect(connection.getAccountInfo).toHaveBeenCalledWith(
      client.addresses(terms).order,
      "finalized",
    );
    await expect(client.prepare(terms, buyer.publicKey)).rejects.toThrow(
      "already been paid",
    );
    vi.mocked(connection.getAccountInfo).mockResolvedValue(
      await account({}, SystemProgram.programId),
    );
    await expect(client.readOrder(terms)).rejects.toThrow("owner");
    for (const change of [
      { amount: new BN(1) },
      { merchant: buyer.publicKey },
      { reference: Array(16).fill(0) },
      { expiresAt: new BN(1000) },
    ]) {
      vi.mocked(connection.getAccountInfo).mockResolvedValue(
        await account(change),
      );
      await expect(client.readOrder(terms)).rejects.toThrow("does not match");
    }
  });
});
