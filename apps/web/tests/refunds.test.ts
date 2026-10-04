import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { refundApproval, type RefundApproval } from "../src/payments/refunds";
const { readOrder } = vi.hoisted(() => ({ readOrder: vi.fn() }));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ readOrder }),
}));
const modules = import.meta.glob("../convex/**/*.ts");

afterEach(() => vi.useRealTimers());
const buyer = Keypair.generate(),
  merchant = Keypair.generate();
const sign = (request: RefundApproval, signer = buyer) => ({
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
    expiresAt: Date.now() + 3600000,
    status: "paid" as const,
  };
  // The action now proves ownership against the recorded receipt before any
  // RPC read, so the link must already be synced.
  await t.mutation(internal.payments.record, { id, receipt });
  readOrder.mockResolvedValue(receipt);
  const request: RefundApproval = {
    id,
    order: receipt.order,
    buyer: receipt.buyer,
    reason: "not_received",
    issuedAt: Date.now(),
  };
  return { t, id, receipt, request };
}
describe("buyer refund requests", () => {
  it("authenticates the buyer, saves a public category once, and queues the request", async () => {
    const { t, id, request } = await setup();
    await t.action(api.paymentActions.requestRefund, sign(request));
    const original = await t.query(api.payments.get, { id });
    await t.action(api.paymentActions.requestRefund, sign(request));
    expect(await t.query(api.payments.get, { id })).toEqual(original);
    expect(original?.refundRequest?.reason).toBe("not_received");
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(1);
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, reason: "cancellation" }),
      ),
    ).rejects.toThrow("already been requested");
  });
  it("rejects forged, altered, wrong-buyer and wrong-order approvals", async () => {
    const { t, request } = await setup();
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request, merchant)),
    ).rejects.toThrow("did not approve");
    await expect(
      t.action(api.paymentActions.requestRefund, {
        ...sign(request),
        reason: "cancellation",
      }),
    ).rejects.toThrow("did not approve");
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, buyer: merchant.publicKey.toBase58() }, merchant),
      ),
    ).rejects.toThrow("verified buyer");
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, order: merchant.publicKey.toBase58() }),
      ),
    ).rejects.toThrow("verified buyer");
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(0);
  });
  it("rejects stale, future, unpaid, expired and resolved requests", async () => {
    const { t, request, receipt } = await setup();
    readOrder.mockClear();
    for (const issuedAt of [Date.now() - 700000, Date.now() + 60000])
      await expect(
        t.action(
          api.paymentActions.requestRefund,
          sign({ ...request, issuedAt }),
        ),
      ).rejects.toThrow("expired");
    // Stale approvals are refused before the bucket and the chain read.
    expect(readOrder).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(
      [],
    );
    readOrder.mockResolvedValue(null);
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("verified buyer");
    readOrder.mockResolvedValue({ ...receipt, expiresAt: Date.now() - 1 });
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("period has ended");
    // The recorded receipt still says "paid", so these reach the chain read
    // and are refused on the fresh receipt.
    for (const status of ["completed", "refunded"]) {
      readOrder.mockResolvedValue({ ...receipt, status });
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("already resolved");
    }
  });
  it("tells a legitimate buyer to wait when the payment is not recorded yet", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.payments.insert, {
      merchant: merchant.publicKey.toBase58(),
      reference: "ef".repeat(16),
      title: "Unsynced order",
      amount: "1000000",
      protectionSeconds: 3600,
      issuedAt: Date.now(),
    });
    const request: RefundApproval = {
      id,
      order: Keypair.generate().publicKey.toBase58(),
      buyer: buyer.publicKey.toBase58(),
      reason: "not_received",
      issuedAt: Date.now(),
    };
    readOrder.mockClear();
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("not been recorded yet");
    // Refused before the bucket and the chain read.
    expect(readOrder).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(
      [],
    );
  });
  it("removes finalized resolutions from the queue and cannot regress on stale RPC responses", async () => {
    const { t, id, request, receipt } = await setup();
    await t.action(api.paymentActions.requestRefund, sign(request));
    readOrder.mockResolvedValue({ ...receipt, status: "refunded" });
    await t.action(api.paymentActions.sync, { id });
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(0);
    // The public sync short-circuits resolved receipts, so the stale re-read
    // goes through the internal path: payments.record must refuse to regress.
    readOrder.mockResolvedValue(receipt);
    await t.action(internal.paymentActions.syncById, { id });
    const link = await t.query(api.payments.get, { id });
    expect(link?.receipt?.status).toBe("refunded");
    expect(link?.refundPending).toBe(false);
    // A repeat request after resolution is a no-op, exactly as the mutation
    // would decide — refused repeats cost no bucket and no chain read.
    readOrder.mockClear();
    await t.action(api.paymentActions.requestRefund, sign(request));
    expect(readOrder).not.toHaveBeenCalled();
    expect(link?.refundRequest?.reason).toBe("not_received");
  });
  it("refuses a new request when a concurrent resolution is already recorded", async () => {
    const { t, id, request, receipt } = await setup();
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, status: "completed" },
    });
    readOrder.mockClear();
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("already resolved");
    expect(readOrder).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(
      [],
    );
  });
  it("refuses a refund after the protection period ends, decided by the chain", async () => {
    const { t, id, request, receipt } = await setup();
    // The recorded receipt's protection has lapsed (record() would not patch
    // a same-status receipt, so patch directly).
    await t.run((ctx) =>
      ctx.db.patch(id, { receipt: { ...receipt, expiresAt: Date.now() - 1 } }),
    );
    // Not refused cheaply: the stored receipt can lag an in-time dispute, so
    // expiry is decided from the confirmed chain read.
    readOrder.mockResolvedValue({ ...receipt, expiresAt: Date.now() - 1 });
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("protection period has ended");
    expect(readOrder).toHaveBeenCalled();
  });
  it("accepts the reason after expiry when the dispute was raised in time", async () => {
    const { t, id, request, receipt } = await setup();
    // The buyer disputed 20s before expiry and signs 30s later: the stored
    // receipt is expired and not yet flagged, and even the finalized read
    // lags; only the confirmed read shows the dispute.
    await t.run((ctx) =>
      ctx.db.patch(id, { receipt: { ...receipt, expiresAt: Date.now() - 1 } }),
    );
    readOrder.mockImplementation(async (_link, commitment) =>
      commitment === "confirmed"
        ? { ...receipt, expiresAt: Date.now() - 1, disputed: true }
        : { ...receipt, expiresAt: Date.now() - 1 },
    );
    await t.action(api.paymentActions.requestRefund, sign(request));
    const link = await t.query(api.payments.get, { id });
    expect(link?.refundRequest?.reason).toBe("not_received");
    expect(link?.refundPending).toBe(true);
  });
  it("replaces a backfilled unspecified reason with the buyer's signed reason", async () => {
    const { t, id, request, receipt } = await setup();
    // The chain-side dispute reached the queue first, with no reason.
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, disputed: true },
    });
    const backfilled = (await t.query(api.payments.get, { id }))
      ?.refundRequest;
    expect(backfilled?.reason).toBe("unspecified");
    readOrder.mockResolvedValue({ ...receipt, disputed: true });
    await t.action(api.paymentActions.requestRefund, sign(request));
    const link = await t.query(api.payments.get, { id });
    expect(link?.refundRequest?.reason).toBe("not_received");
    expect(link?.refundRequest?.requestedAt).toBe(backfilled?.requestedAt);
    // The real reason is now locked in.
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, reason: "cancellation" }),
      ),
    ).rejects.toThrow("already been requested");
  });
  it("reports an on-chain resolution not yet synced as already resolved", async () => {
    const { t, request, receipt } = await setup();
    process.env.REQUIRE_ONCHAIN_DISPUTE = "1";
    try {
      // Convex still says "paid" and protection has even ended, but the
      // resolver already refunded on-chain: the fresh read's status decides
      // first, and no confirmed read is wasted on a resolved order.
      readOrder.mockResolvedValue({
        ...receipt,
        status: "refunded",
        expiresAt: Date.now() - 1,
      });
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("already resolved");
      expect(readOrder).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.REQUIRE_ONCHAIN_DISPUTE;
    }
  });
  it("keeps the rate-limit slot when the on-chain dispute is missing", async () => {
    vi.useFakeTimers();
    const { t, id, request, receipt } = await setup();
    process.env.REQUIRE_ONCHAIN_DISPUTE = "1";
    try {
      readOrder.mockResolvedValue(receipt);
      for (let i = 0; i < 5; i++)
        await expect(
          t.action(api.paymentActions.requestRefund, sign(request)),
        ).rejects.toThrow("on-chain dispute first");
      // Each refusal is a deterministic failure, so it keeps its slot: a buyer
      // who never disputes cannot replay an approval for unlimited reads.
      // Each attempt costs at most two reads (finalized, then confirmed).
      expect(readOrder).toHaveBeenCalledTimes(10);
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("Too many requests");
      expect(readOrder).toHaveBeenCalledTimes(10);
      // Once the dispute confirms, the next window accepts the request.
      vi.advanceTimersByTime(60_000);
      readOrder.mockResolvedValue({ ...receipt, disputed: true });
      await t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, issuedAt: Date.now() }),
      );
      expect((await t.query(api.payments.get, { id }))?.refundPending).toBe(
        true,
      );
    } finally {
      delete process.env.REQUIRE_ONCHAIN_DISPUTE;
    }
  });
  it("reads the chain once when the confirmed read cannot change the outcome", async () => {
    const { t, request } = await setup();
    // Gate off and protection still running: the finalized read decides.
    await t.action(api.paymentActions.requestRefund, sign(request));
    expect(readOrder).toHaveBeenCalledTimes(1);
    expect(readOrder.mock.calls[0][1]).toBeUndefined();
  });
  it("keeps a recorded dispute when the refund request's finalized read lags", async () => {
    const { t, id, request, receipt } = await setup();
    // record() already holds the chain's Disputed flag (and an unspecified
    // backfilled request) from a fresher RPC.
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, disputed: true },
    });
    // The buyer's reason arrives; this action's finalized read still lags
    // and does not show the dispute yet.
    readOrder.mockResolvedValue(receipt);
    await t.action(api.paymentActions.requestRefund, sign(request));
    const link = await t.query(api.payments.get, { id });
    expect(link?.refundRequest?.reason).toBe("not_received");
    // Disputed never regresses, so the stored flag survives the lagging read.
    expect(link?.receipt?.disputed).toBe(true);
  });
  it("passes the action's clock through, but never past the release grace", async () => {
    vi.useFakeTimers();
    const { t, id, request, receipt } = await setup();
    const near = { ...receipt, expiresAt: Date.now() + 1_000 };
    await t.mutation(internal.payments.record, { id, receipt: near });
    // The finalized read takes 2s and crosses the deadline: the action's
    // clock (taken before the read) decides, so the request is accepted.
    readOrder.mockImplementation(async () => {
      vi.advanceTimersByTime(2_000);
      return near;
    });
    await t.action(api.paymentActions.requestRefund, sign(request));
    expect((await t.query(api.payments.get, { id }))?.refundPending).toBe(
      true,
    );
  });
  it("refuses when a stalled read lands past the release grace", async () => {
    vi.useFakeTimers();
    const { t, id, request, receipt } = await setup();
    const near = { ...receipt, expiresAt: Date.now() + 1_000 };
    await t.mutation(internal.payments.record, { id, receipt: near });
    // The read stalls 62s: by then the keeper may have released the order.
    readOrder.mockImplementation(async () => {
      vi.advanceTimersByTime(62_000);
      return near;
    });
    await expect(
      t.action(
        api.paymentActions.requestRefund,
        sign({ ...request, issuedAt: Date.now() }),
      ),
    ).rejects.toThrow("protection period has ended");
    expect((await t.query(api.payments.get, { id }))?.refundRequest).toBe(
      undefined,
    );
  });
  it("trusts a stored dispute with the gate on: one read, no confirmed read", async () => {
    const { t, id, request, receipt } = await setup();
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, disputed: true },
    });
    process.env.REQUIRE_ONCHAIN_DISPUTE = "1";
    try {
      // This node's finalized read still lags the dispute.
      readOrder.mockClear();
      readOrder.mockResolvedValue(receipt);
      await t.action(api.paymentActions.requestRefund, sign(request));
      expect(readOrder).toHaveBeenCalledTimes(1);
      expect(
        (await t.query(api.payments.get, { id }))?.refundRequest?.reason,
      ).toBe("not_received");
    } finally {
      delete process.env.REQUIRE_ONCHAIN_DISPUTE;
    }
  });
  it("reports a resolution seen only at confirmed as already resolved", async () => {
    const { t, request, receipt } = await setup();
    process.env.REQUIRE_ONCHAIN_DISPUTE = "1";
    try {
      // Finalized still shows the order open; confirmed already shows the
      // resolver's refund.
      readOrder.mockImplementation(async (_terms, commitment) =>
        commitment === "confirmed"
          ? { ...receipt, status: "refunded" as const }
          : receipt,
      );
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("already resolved");
    } finally {
      delete process.env.REQUIRE_ONCHAIN_DISPUTE;
    }
  });
  it("records the refund outcome only when a request existed", async () => {
    const { t, id, request, receipt } = await setup();
    await t.action(api.paymentActions.requestRefund, sign(request));
    readOrder.mockResolvedValue({ ...receipt, status: "completed" });
    await t.action(api.paymentActions.sync, { id });
    const resolved = await t.query(api.payments.get, { id });
    expect(resolved?.refundOutcome).toBe("completed");
    expect(typeof resolved?.refundResolvedAt).toBe("number");
    const plain = await t.mutation(internal.payments.insert, {
      merchant: merchant.publicKey.toBase58(),
      reference: "cd".repeat(16),
      title: "Undisputed order",
      amount: "1000000",
      protectionSeconds: 3600,
      issuedAt: Date.now(),
    });
    await t.mutation(internal.payments.record, {
      id: plain,
      receipt: { ...receipt, status: "completed" },
    });
    const undisputed = await t.query(api.payments.get, { id: plain });
    expect(undisputed?.refundOutcome).toBeUndefined();
    expect(undisputed?.refundResolvedAt).toBeUndefined();
  });
  it("orders the queue by protection deadline and paginates it", async () => {
    const t = convexTest(schema, modules);
    const ids: string[] = [];
    // Insert out of order: +3h, +1h, +2h deadlines.
    for (const [index, hours] of [3, 1, 2].entries()) {
      const id = await t.mutation(internal.payments.insert, {
        merchant: merchant.publicKey.toBase58(),
        reference: `${index}f`.repeat(16),
        title: `Order ${index}`,
        amount: "1000000",
        protectionSeconds: 3600,
        issuedAt: Date.now(),
      });
      await t.mutation(internal.payments.requestRefund, {
        id,
        receipt: {
          order: Keypair.generate().publicKey.toBase58(),
          buyer: buyer.publicKey.toBase58(),
          reserveAmount: "50000",
          createdAt: Date.now(),
          expiresAt: Date.now() + hours * 3600000,
          status: "paid" as const,
        },
        reason: "not_received",
      });
      ids.push(id);
    }
    const queue = await t.query(api.payments.refundQueue, {});
    expect(queue.map((link) => link._id)).toEqual([ids[1], ids[2], ids[0]]);
    const first = await t.query(api.payments.refundQueuePage, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((link) => link._id)).toEqual([ids[1], ids[2]]);
    expect(first.isDone).toBe(false);
    const second = await t.query(api.payments.refundQueuePage, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page.map((link) => link._id)).toEqual([ids[0]]);
    expect(second.isDone).toBe(true);
  });
});
