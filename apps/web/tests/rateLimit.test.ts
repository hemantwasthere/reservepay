import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import type { ActionCtx } from "../convex/_generated/server";
import schema from "../convex/schema";
import { release } from "../convex/rateLimit";
import { refundApproval, type RefundApproval } from "../src/payments/refunds";
import { signInMessage } from "../src/lib/sign-in";
import { signIn, TEST_DOMAIN } from "./session";

const { readOrder } = vi.hoisted(() => ({ readOrder: vi.fn() }));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ readOrder }),
}));
const modules = import.meta.glob("../convex/**/*.ts");

// release() is an action-side helper; this exercises it against the test
// backend without going through a public action.
const asActionCtx = (t: ReturnType<typeof convexTest>): ActionCtx =>
  ({
    runMutation: (reference: FunctionReference<"mutation">, args: unknown) =>
      t.mutation(reference, args as never),
  }) as unknown as ActionCtx;

// Several tests drive dozens of actions; the 5s default is borderline when
// the full suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => vi.useRealTimers());

describe("fixed-window rate limiter", () => {
  it("allows up to the limit per window, then denies with a retry delay", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 2, windowMs: 10_000 };
    // Every result names the window it belongs to.
    const windowEnd = Date.now() + 10_000;
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: true,
      retryAfterMs: 0,
      expiresAt: windowEnd,
    });
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: true,
      retryAfterMs: 0,
      expiresAt: windowEnd,
    });
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: false,
      retryAfterMs: 10_000,
      expiresAt: windowEnd,
    });
    vi.advanceTimersByTime(5_000);
    expect(await t.mutation(internal.rateLimit.hit, args)).toEqual({
      allowed: false,
      retryAfterMs: 5_000,
      expiresAt: windowEnd,
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
    // A 20-minute window started more than 10 minutes ago: its start is
    // older than the retention cutoff, but the bucket is still in force.
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
  it("release returns a hit to the window it came from only", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 1, windowMs: 10_000 };
    const first = await t.mutation(internal.rateLimit.hit, args);
    await t.mutation(internal.rateLimit.unhit, {
      key: args.key,
      expiresAt: first.expiresAt,
    });
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(true);
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(false);
    // Releasing an expired window is a no-op.
    vi.advanceTimersByTime(10_000);
    await t.mutation(internal.rateLimit.unhit, {
      key: args.key,
      expiresAt: first.expiresAt,
    });
    expect(
      await t.run((ctx) => ctx.db.query("rateLimits").collect()),
    ).toHaveLength(1);
  });
  it("a slow release cannot free the next window's claim", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:roll", limit: 1, windowMs: 5_000 };
    // A claims window 1 and its work hangs past the rollover.
    const a = await t.mutation(internal.rateLimit.hit, args);
    vi.advanceTimersByTime(5_500);
    // C claims window 2.
    const c = await t.mutation(internal.rateLimit.hit, args);
    expect(c.allowed).toBe(true);
    expect(c.expiresAt).not.toBe(a.expiresAt);
    // A's late release names window 1, so window 2 stays claimed.
    await t.mutation(internal.rateLimit.unhit, {
      key: args.key,
      expiresAt: a.expiresAt,
    });
    expect((await t.mutation(internal.rateLimit.hit, args)).allowed).toBe(false);
  });
  it("treats rows from the earlier schema as expired and sweeps them", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    // Shape written by the previous build: windowStart, no expiresAt.
    await t.run((ctx) =>
      ctx.db.insert("rateLimits", {
        key: "test:legacy",
        windowStart: Date.now(),
        count: 99,
      }),
    );
    // An old legacy row: Convex omits documents missing the indexed field, so
    // the by_expires_at sweep can never reach it — by_window does.
    await t.run((ctx) =>
      ctx.db.insert("rateLimits", {
        key: "test:legacy-unswept",
        windowStart: Date.now() - 11 * 60_000,
        count: 99,
      }),
    );
    // A full legacy bucket does not deny: it is treated as an expired window.
    expect(
      (
        await t.mutation(internal.rateLimit.hit, {
          key: "test:legacy",
          limit: 1,
          windowMs: 1_000,
        })
      ).allowed,
    ).toBe(true);
    // The reused row converges to the new shape.
    const reused = (
      await t.run((ctx) => ctx.db.query("rateLimits").collect())
    ).find((row) => row.key === "test:legacy");
    expect(reused?.expiresAt).toBe(Date.now() + 1_000);
    expect(reused?.windowStart).toBeUndefined();
    // The old legacy row is swept; the live reused row survives.
    await t.mutation(internal.rateLimit.cleanup, {});
    const keys = (
      await t.run((ctx) => ctx.db.query("rateLimits").collect())
    ).map((row) => row.key);
    expect(keys).toEqual(["test:legacy"]);
  });
  it("release ignores a denied claim", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const args = { key: "test:a", limit: 1, windowMs: 10_000 };
    const first = await t.mutation(internal.rateLimit.hit, args);
    const denied = await t.mutation(internal.rateLimit.hit, args);
    expect(denied.allowed).toBe(false);
    // A denied claim only observed the live window; releasing it must not
    // free the claim that window belongs to.
    await release(asActionCtx(t), "test", "a", denied);
    expect(
      (await t.run((ctx) => ctx.db.query("rateLimits").collect()))[0]?.count,
    ).toBe(1);
    // Releasing the real claim still works through the same helper.
    await release(asActionCtx(t), "test", "a", first);
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(
      [],
    );
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
    // Inside the window: no RPC. With nothing recorded the coalesced call
    // reports null ("not checked"), never a verified false.
    expect(await t.action(api.paymentActions.sync, { id })).toBeNull();
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
  it("releases the bucket when the chain read fails transiently", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    readOrder.mockRejectedValue(new Error("503 Service Unavailable: upstream error"));
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "503",
    );
    expect(readOrder).toHaveBeenCalledTimes(1);
    // The outage returned the bucket: the next caller within the window
    // retries the chain instead of getting a coalesced answer.
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "503",
    );
    expect(readOrder).toHaveBeenCalledTimes(2);
  });
  it("keeps the bucket when the chain read is rate limited", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    readOrder.mockRejectedValue(
      new Error("429 Too Many Requests: you are rate limited"),
    );
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "429",
    );
    expect(readOrder).toHaveBeenCalledTimes(1);
    // The slot was kept: while devnet throttles, other callers are coalesced
    // instead of each doing a retry-wrapped read that fails again.
    expect(await t.action(api.paymentActions.sync, { id })).toBeNull();
    expect(readOrder).toHaveBeenCalledTimes(1);
    // The next window tries the chain again.
    vi.advanceTimersByTime(5_000);
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "429",
    );
    expect(readOrder).toHaveBeenCalledTimes(2);
  });
  it("keeps the bucket when the chain read fails deterministically", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const id = await insertLink(t);
    // Anyone can create an order with this link's reference and a wrong
    // amount; every read then throws. That must not bypass the coalescer.
    readOrder.mockRejectedValue(
      new Error(
        "The on-chain order does not match this payment link. Do not send another payment.",
      ),
    );
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "does not match",
    );
    for (let i = 0; i < 5; i++)
      expect(await t.action(api.paymentActions.sync, { id })).toBeNull();
    expect(readOrder).toHaveBeenCalledTimes(1);
    // The next window reads (and fails) once again.
    vi.advanceTimersByTime(5_000);
    await expect(t.action(api.paymentActions.sync, { id })).rejects.toThrow(
      "does not match",
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
    // The stranger's attempt cost nothing: the buyer still gets five chain
    // reads. (The chain disagreeing keeps each attempt from being recorded,
    // so every one reaches the bucket.)
    readOrder.mockResolvedValue(null);
    for (let i = 0; i < 5; i++)
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("verified buyer");
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("Too many requests");
  });
  it("repeat requests cost no bucket and no chain read", async () => {
    const { t, request } = await setup();
    await t.action(api.paymentActions.requestRefund, sign(request));
    readOrder.mockClear();
    // Same reason: no-op. A replayed old approval is also a no-op, not a
    // bucket spend.
    for (let i = 0; i < 10; i++)
      await t.action(api.paymentActions.requestRefund, sign(request));
    await t.action(
      api.paymentActions.requestRefund,
      sign({ ...request, issuedAt: Date.now() - 3_600_000 }),
    );
    // Different reason: refused, still before the bucket.
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, reason: "cancellation" }),
      ),
    ).rejects.toThrow("already been requested");
    expect(readOrder).not.toHaveBeenCalled();
    const buckets = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(buckets.find((row) => row.key === `refund:${request.id}`)?.count).toBe(
      1,
    );
  });
  it("an RPC outage does not lock the buyer out", async () => {
    const { t, request } = await setup();
    readOrder.mockRejectedValue(
      new Error("503 Service Unavailable: upstream error"),
    );
    for (let i = 0; i < 8; i++)
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("503");
    // Recovered: the transient failures returned their claims.
    readOrder.mockResolvedValue({
      order: request.order,
      buyer: request.buyer,
      reserveAmount: "50000",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      status: "paid" as const,
    });
    await t.action(api.paymentActions.requestRefund, sign(request));
  });
  it("keeps the buyer's bucket when the RPC is rate limited", async () => {
    vi.useFakeTimers();
    const { t, request } = await setup();
    readOrder.mockRejectedValue(
      new Error("429 Too Many Requests: you are rate limited"),
    );
    for (let i = 0; i < 5; i++)
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("429");
    expect(readOrder).toHaveBeenCalledTimes(5);
    // The slots were kept: under throttling the buyer's own limit is the
    // backpressure, not a free retry loop.
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("Too many requests");
    expect(readOrder).toHaveBeenCalledTimes(5);
    // The next window retries the chain.
    vi.advanceTimersByTime(60_000);
    readOrder.mockResolvedValue({
      order: request.order,
      buyer: request.buyer,
      reserveAmount: "50000",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      status: "paid" as const,
    });
    await t.action(api.paymentActions.requestRefund, sign(request));
  });
});
