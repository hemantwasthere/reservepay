import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { refundApproval, type RefundApproval } from "../src/payments/refunds";
import { signInMessage } from "../src/lib/sign-in";
import { signIn, TEST_DOMAIN } from "./session";

const { readOrder } = vi.hoisted(() => ({ readOrder: vi.fn() }));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ readOrder }),
}));
const modules = import.meta.glob("../convex/**/*.ts");

// Several tests drive dozens of actions; the 5s default is borderline when
// the full suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => vi.useRealTimers());

describe("fixed-window rate limiter", () => {
  it("allows up to the limit per window, then denies with a retry delay", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 2, windowMs: 10_000 };
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: false,
      retryAfterMs: 10_000,
    });
    vi.advanceTimersByTime(5_000);
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: false,
      retryAfterMs: 5_000,
    });
    vi.advanceTimersByTime(5_000);
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(true);
  });
  it("isolates keys", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 1, windowMs: 10_000 };
    await t.mutation(internal.rateLimit.hit, args);
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(
      false,
    );
    expect(
      (await t.mutation(internal.rateLimit.hit, { ...args, key: "test:b" }))
        .allowed,
    ).toBe(true);
  });
  it("cleanup deletes only stale buckets", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { limit: 1, windowMs: 1_000 };
    await t.mutation(internal.rateLimit.hit, { ...args, key: "test:old" });
    vi.advanceTimersByTime(11 * 60_000);
    await t.mutation(internal.rateLimit.hit, { ...args, key: "test:new" });
    expect(await t.mutation(internal.rateLimit.cleanup, {})).toBe(1);
    const rows = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(rows.map((row) => row.key)).toEqual(["test:new"]);
    // The surviving bucket still denies inside its own window.
    expect(
      (await t.mutation(internal.rateLimit.hit, { ...args, key: "test:new" }))
        .allowed,
    ).toBe(false);
  });
  it("cleanup never resets a window that is still live", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    // A 20-minute window started more than 10 minutes ago: older than the
    // retention cutoff by windowStart, but its bucket is still in force.
    await t.mutation(internal.rateLimit.hit, {
      key: "test:long",
      limit: 1,
      windowMs: 20 * 60_000,
    });
    vi.advanceTimersByTime(11 * 60_000);
    expect(await t.mutation(internal.rateLimit.cleanup, {})).toBe(0);
    expect(
      (
        await t.mutation(internal.rateLimit.hit, {
          key: "test:long",
          limit: 1,
          windowMs: 20 * 60_000,
        })
      ).allowed,
    ).toBe(false);
  });
  it("release returns a hit to the current window only", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 1, windowMs: 10_000 };
    await t.mutation(internal.rateLimit.hit, args);
    await t.mutation(internal.rateLimit.unhit, { key: args.key });
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(true);
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(false);
    // Releasing an expired window is a no-op.
    vi.advanceTimersByTime(10_000);
    await t.mutation(internal.rateLimit.unhit, { key: args.key });
    expect(
      await t.run((ctx) => ctx.db.query("rateLimits").collect()),
    ).toHaveLength(1);
  });
});

describe("paymentActions.sync coalescing", () => {
  const seller = Keypair.generate().publicKey.toBase58();
  const insertLink = (t: ReturnType<typeof convexTest>) =>
    t.mutation(internal.payments.insert, {
      merchant: seller,
      reference: crypto.randomUUID().replaceAll("-", ""),
      title: "Test order",
      amount: "1000000",
      protectionSeconds: 3600,
      issuedAt: Date.now(),
    });

  it("coalesces repeat syncs within 5s without a chain read", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    readOrder.mockResolvedValue(null);
    expect(await t.action(api.paymentActions.sync, { id })).toBe(false);
    expect(readOrder).toHaveBeenCalledTimes(1);
    // Inside the window: no RPC, and the caller still gets a usable answer.
    expect(await t.action(api.paymentActions.sync, { id })).toBe(false);
    expect(readOrder).toHaveBeenCalledTimes(1);
    // A different link has its own bucket.
    const other = await insertLink(t);
    await t.action(api.paymentActions.sync, { id: other });
    expect(readOrder).toHaveBeenCalledTimes(2);
    // After the window the same link reads the chain again.
    vi.advanceTimersByTime(5_000);
    await t.action(api.paymentActions.sync, { id });
    expect(readOrder).toHaveBeenCalledTimes(3);
  });
  it("reports a recorded receipt for a coalesced sync", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    const receipt = {
      order: Keypair.generate().publicKey.toBase58(),
      buyer: Keypair.generate().publicKey.toBase58(),
      reserveAmount: "50000",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      status: "paid" as const,
    };
    readOrder.mockResolvedValue(receipt);
    expect(await t.action(api.paymentActions.sync, { id })).toBe(true);
    expect(await t.action(api.paymentActions.sync, { id })).toBe(true);
    expect(readOrder).toHaveBeenCalledTimes(1);
  });
  it("releases the bucket when the chain read fails", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    readOrder.mockRejectedValue(new Error("RPC unavailable"));
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "RPC unavailable",
    );
    expect(readOrder).toHaveBeenCalledTimes(1);
    // The failed read returned the bucket: the next caller within the window
    // retries the chain instead of getting a quiet false.
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "RPC unavailable",
    );
    expect(readOrder).toHaveBeenCalledTimes(2);
  });
  it("short-circuits a resolved receipt with no bucket and no chain read", async () => {
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    await t.mutation(internal.payments.record, {
      id,
      receipt: {
        order: Keypair.generate().publicKey.toBase58(),
        buyer: Keypair.generate().publicKey.toBase58(),
        reserveAmount: "50000",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3_600_000,
        status: "completed" as const,
      },
    });
    expect(await t.action(api.paymentActions.sync, { id })).toBe(true);
    expect(readOrder).not.toHaveBeenCalled();
  });
  it("rejects unknown link ids", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.paymentActions.sync, { id: "bad-id" }),
    ).rejects.toThrow("not found");
  });
});

describe("authActions.signIn rate limit", () => {
  const seller = Keypair.generate();
  const other = Keypair.generate();
  it("ignores bad signatures, then denies the 11th good sign-in", async () => {
    const t = convexTest(schema, modules);
    const wallet = seller.publicKey.toBase58();
    // A stranger can burn attempts, but garbage signatures never touch the
    // wallet's bucket.
    for (let i = 0; i < 10; i++) {
      const challenge = await t.action(api.authActions.requestNonce, {
        wallet,
      });
      await expect(
        t.action(api.authActions.signIn, {
          ...challenge,
          wallet,
          domain: TEST_DOMAIN,
          signature: bs58.encode(
            nacl.sign.detached(
              signInMessage({ ...challenge, wallet, domain: TEST_DOMAIN }),
              other.secretKey,
            ),
          ),
        }),
      ).rejects.toThrow("did not approve");
    }
    for (let i = 0; i < 10; i++) await signIn(t, seller);
    await expect(signIn(t, seller)).rejects.toThrow("Too many requests");
    // Another wallet has its own bucket.
    expect((await signIn(t, other)).token).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("paymentActions.requestRefund rate limit", () => {
  const buyer = Keypair.generate();
  const merchant = Keypair.generate();
  const stranger = Keypair.generate();
  const sign = (request: RefundApproval, signer: Keypair = buyer) => ({
    ...request,
    signature: bs58.encode(
      nacl.sign.detached(refundApproval(request), signer.secretKey),
    ),
  });
  async function setup() {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, {
      merchant: merchant.publicKey.toBase58(),
      reference: "ab".repeat(16),
      title: "Test order",
      amount: "1000000",
      protectionSeconds: 3600,
      issuedAt: Date.now(),
    });
    const receipt = {
      order: Keypair.generate().publicKey.toBase58(),
      buyer: buyer.publicKey.toBase58(),
      reserveAmount: "50000",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      status: "paid" as const,
    };
    await t.mutation(internal.payments.record, { id, receipt });
    readOrder.mockResolvedValue(receipt);
    const request: RefundApproval = {
      id,
      order: receipt.order,
      buyer: receipt.buyer,
      reason: "not_received",
      issuedAt: Date.now(),
    };
    return { t, request };
  }
  it("rejects a stranger before the RPC without spending the buyer's bucket", async () => {
    const { t, request } = await setup();
    readOrder.mockClear();
    const forged = {
      ...request,
      buyer: stranger.publicKey.toBase58(),
    };
    await expect(
      t.action(api.paymentActions.requestRefund, sign(forged, stranger)),
    ).rejects.toThrow("verified buyer");
    expect(readOrder).not.toHaveBeenCalled();
    // The stranger's attempt cost nothing: the buyer still gets five.
    for (let i = 0; i < 5; i++)
      await t.action(api.paymentActions.requestRefund, sign(request));
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("Too many requests");
  });
});
