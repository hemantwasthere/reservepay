import { describe, expect, it, vi } from "vitest";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PROGRAM_ID, protocolAddress } from "@reservepay/core";
import {
  ORDER_STATUS_OFFSET,
  paymentClient,
  readChainTime,
} from "../src/payments/chain";
import { DEVNET_USDC } from "../src/merchant/client";
import idl from "../src/merchant/reservepay.json";
import type { Reservepay } from "../src/merchant/reservepay";
import {
  loadResolution,
  saveResolution,
  clearResolution,
} from "../src/payments/resolution-pending";
import bs58 from "bs58";
const merchant = Keypair.generate(),
  buyer = Keypair.generate(),
  resolver = Keypair.generate();
const terms = {
  merchant: merchant.publicKey.toBase58(),
  reference: "ab".repeat(16),
  title: "Test",
  amount: "1000000",
  protectionSeconds: 3600,
  issuedAt: Date.now(),
};
async function setup({
  now = 100,
  status = { open: {} },
  protocolOwner = PROGRAM_ID,
  lamports = 1e9,
} = {}) {
  const rpc = {
    getAccountInfo: vi.fn(),
    getBalance: vi.fn(async () => lamports),
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 100,
    })),
    getFeeForMessage: vi.fn(async () => ({ value: 5200 })),
    getMinimumBalanceForRentExemption: vi.fn(async () => 1000000),
  } as unknown as Connection;
  const client = paymentClient(rpc),
    coder = new Program<Reservepay>(idl as Reservepay, { connection: rpc })
      .coder.accounts;
  const state = {
    merchant: client.addresses(terms).merchant,
    buyer: buyer.publicKey,
    buyerTokenAccount: getAssociatedTokenAddressSync(
      DEVNET_USDC,
      buyer.publicKey,
    ),
    reference: Array(16).fill(171),
    amount: new BN(1000000),
    reserveAmount: new BN(50000),
    createdAt: new BN(100),
    expiresAt: new BN(3700),
    status,
    bump: 1,
  };
  const orderData = await coder.encode("order", state);
  const protocolData = await coder.encode("protocol", {
    authority: resolver.publicKey,
    resolver: resolver.publicKey,
    defaultReserveBps: 500,
    bump: 1,
  });
  const clock = Buffer.alloc(40);
  clock.writeBigInt64LE(BigInt(now), 32);
  vi.mocked(rpc.getAccountInfo).mockImplementation(async (address) => {
    if (address.equals(client.addresses(terms).order))
      return { data: orderData, owner: PROGRAM_ID } as never;
    if (address.equals(protocolAddress()))
      return { data: protocolData, owner: protocolOwner } as never;
    if (address.equals(SYSVAR_CLOCK_PUBKEY)) return { data: clock } as never;
    return null;
  });
  return { client, rpc, state };
}
describe("order resolution transactions", () => {
  it("refunds only through the configured resolver to the stored buyer account", async () => {
    const { client, state } = await setup();
    for (const signer of [buyer, merchant])
      await expect(
        client.prepareResolution(terms, signer.publicKey, "refund"),
      ).rejects.toThrow("Only the configured resolver");
    const { transaction } = await client.prepareResolution(
      terms,
      resolver.publicKey,
      "refund",
    );
    const ix = transaction.instructions.at(-1)!;
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(ix.keys[4].pubkey.equals(state.buyerTokenAccount)).toBe(true);
    expect(ix.keys[5].pubkey.equals(resolver.publicKey)).toBe(true);
    expect(ix.keys[5].isSigner).toBe(true);
    transaction.sign(resolver);
    expect(transaction.verifySignatures()).toBe(true);
  });
  it("uses chain time for merchant completion and allows the resolver to complete early", async () => {
    const { client } = await setup();
    await expect(
      client.prepareResolution(terms, merchant.publicKey, "complete"),
    ).rejects.toThrow("Protection has not ended");
    await expect(
      client.prepareResolution(terms, buyer.publicKey, "complete"),
    ).rejects.toThrow("merchant or resolver");
    expect(
      (await client.prepareResolution(terms, resolver.publicKey, "complete"))
        .transaction.instructions,
    ).toHaveLength(4);
    const expired = await setup({ now: 3700 });
    expect(
      (
        await expired.client.prepareResolution(
          terms,
          merchant.publicKey,
          "complete",
        )
      ).transaction.instructions,
    ).toHaveLength(4);
  });
  it("rejects resolved orders, untrusted protocol accounts and insufficient fees", async () => {
    const resolved = await setup({ status: { completed: {} } as never });
    await expect(
      resolved.client.prepareResolution(terms, resolver.publicKey, "refund"),
    ).rejects.toThrow("already resolved");
    const wrongOwner = await setup({ protocolOwner: SystemProgram.programId });
    await expect(
      wrongOwner.client.prepareResolution(terms, resolver.publicKey, "refund"),
    ).rejects.toThrow("verify the protocol");
    const noFunds = await setup({ lamports: 0 });
    await expect(
      noFunds.client.prepareResolution(terms, resolver.publicKey, "refund"),
    ).rejects.toThrow("network fee");
  });
  it("keeps the shared complete-order builder byte-identical to the previous inline code", async () => {
    const { client, rpc } = await setup({ now: 3700 });
    const { transaction } = await client.prepareResolution(
      terms,
      merchant.publicKey,
      "complete",
    );
    const {
      authority,
      merchant: merchantPda,
      order,
      reserveVault,
      merchantTokenAccount,
    } = client.addresses(terms);
    const program = new Program<Reservepay>(idl as Reservepay, {
      connection: rpc,
    });
    const expected = [
      createAssociatedTokenAccountIdempotentInstruction(
        merchant.publicKey,
        merchantTokenAccount,
        authority,
        DEVNET_USDC,
      ),
      await program.methods
        .completeOrder()
        .accountsStrict({
          protocol: protocolAddress(),
          merchant: merchantPda,
          order,
          reserveVault,
          merchantTokenAccount,
          caller: merchant.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ];
    const shape = (instruction: (typeof expected)[number]) => ({
      programId: instruction.programId.toBase58(),
      keys: instruction.keys.map((key) => [
        key.pubkey.toBase58(),
        key.isSigner,
        key.isWritable,
      ]),
      data: Buffer.from(instruction.data).toString("hex"),
    });
    expect(transaction.instructions.slice(2).map(shape)).toEqual(
      expected.map(shape),
    );
  });
  it("pins ORDER_STATUS_OFFSET against the Anchor coder", async () => {
    const { rpc, state } = await setup();
    const coder = new Program<Reservepay>(idl as Reservepay, {
      connection: rpc,
    }).coder.accounts;
    const open = await coder.encode("order", state);
    expect(open[ORDER_STATUS_OFFSET]).toBe(0);
    const completed = await coder.encode("order", {
      ...state,
      status: { completed: {} } as never,
    });
    expect(completed[ORDER_STATUS_OFFSET]).toBe(1);
    const refunded = await coder.encode("order", {
      ...state,
      status: { refunded: {} } as never,
    });
    expect(refunded[ORDER_STATUS_OFFSET]).toBe(2);
    const disputed = await coder.encode("order", {
      ...state,
      status: { disputed: {} } as never,
    });
    expect(disputed[ORDER_STATUS_OFFSET]).toBe(3);
  });
  it("leaves disputed orders to the resolver alone", async () => {
    const disputed = await setup({ now: 3700, status: { disputed: {} } as never });
    await expect(
      disputed.client.prepareResolution(terms, merchant.publicKey, "complete"),
    ).rejects.toThrow("under dispute");
    await expect(
      disputed.client.prepareResolution(terms, buyer.publicKey, "complete"),
    ).rejects.toThrow("under dispute");
    await expect(
      disputed.client.prepareResolution(terms, merchant.publicKey, "refund"),
    ).rejects.toThrow("Only the configured resolver");
    for (const action of ["refund", "complete"] as const)
      await expect(
        disputed.client.prepareResolution(terms, resolver.publicKey, action),
      ).resolves.toBeTruthy();
  });
  it("builds the buyer's on-chain dispute transaction only inside the window", async () => {
    const { client, rpc } = await setup();
    const { transaction } = await client.prepareRefundRequest(
      terms,
      buyer.publicKey,
    );
    const ix = transaction.instructions.at(-1)!;
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(ix.keys[0].pubkey.equals(client.addresses(terms).order)).toBe(true);
    expect(ix.keys[1].pubkey.equals(buyer.publicKey)).toBe(true);
    expect(ix.keys[1].isSigner).toBe(true);
    transaction.sign(buyer);
    expect(transaction.verifySignatures()).toBe(true);
    await expect(
      client.prepareRefundRequest(terms, merchant.publicKey),
    ).rejects.toThrow("Only the buyer");
    const expired = await setup({ now: 3700 });
    await expect(
      expired.client.prepareRefundRequest(terms, buyer.publicKey),
    ).rejects.toThrow("protection period has ended");
    // A retry on an order the buyer already disputed says so, rather than
    // the generic "already resolved".
    const disputed = await setup({ status: { disputed: {} } as never });
    await expect(
      disputed.client.prepareRefundRequest(terms, buyer.publicKey),
    ).rejects.toThrow("already disputed");
    const refunded = await setup({ status: { refunded: {} } as never });
    await expect(
      refunded.client.prepareRefundRequest(terms, buyer.publicKey),
    ).rejects.toThrow("already resolved");
    expect(rpc.getBalance).toHaveBeenCalled();
  });
  it("decodes the chain clock unix timestamp", async () => {
    const { rpc } = await setup({ now: 1234 });
    await expect(readChainTime(rpc)).resolves.toBe(1234n);
  });
  it("recovers saved transactions and refuses malformed journals", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    try {
      const pending = {
        signature: bs58.encode(new Uint8Array(64).fill(1)),
        signer: resolver.publicKey.toBase58(),
        lastValidBlockHeight: 100,
        action: "refund" as const,
      };
      saveResolution("order", pending);
      expect(loadResolution("order")).toEqual(pending);
      expect(loadResolution("another-order")).toBeNull();
      clearResolution("order");
      expect(loadResolution("order")).toBeNull();
      for (const changes of [
        { signature: "bad" },
        { signer: "bad" },
        { action: "withdraw" },
        { lastValidBlockHeight: -1 },
      ]) {
        saveResolution("order", { ...pending, ...changes } as never);
        expect(() => loadResolution("order")).toThrow();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
