import { describe, expect, it, vi } from "vitest";
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
    for (const issuedAt of [Date.now() - 700000, Date.now() + 60000])
      await expect(
        t.action(
          api.paymentActions.requestRefund,
          sign({ ...request, issuedAt }),
        ),
      ).rejects.toThrow("expired");
    readOrder.mockResolvedValue(null);
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("verified buyer");
    readOrder.mockResolvedValue({ ...receipt, expiresAt: Date.now() - 1 });
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("period has ended");
    for (const status of ["completed", "refunded"]) {
      readOrder.mockResolvedValue({ ...receipt, status });
      await expect(
        t.action(api.paymentActions.requestRefund, sign(request)),
      ).rejects.toThrow("already resolved");
    }
  });
  it("removes finalized resolutions from the queue and cannot regress on stale RPC responses", async () => {
    const { t, id, request, receipt } = await setup();
    await t.action(api.paymentActions.requestRefund, sign(request));
    readOrder.mockResolvedValue({ ...receipt, status: "refunded" });
    await t.action(api.paymentActions.sync, { id });
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(0);
    readOrder.mockResolvedValue(receipt);
    await t.action(api.paymentActions.sync, { id });
    await t.action(api.paymentActions.requestRefund, sign(request));
    const link = await t.query(api.payments.get, { id });
    expect(link?.receipt?.status).toBe("refunded");
    expect(link?.refundPending).toBe(false);
    expect(link?.refundRequest?.reason).toBe("not_received");
  });
  it("refuses a new request when a concurrent resolution is already recorded", async () => {
    const { t, id, request, receipt } = await setup();
    await t.mutation(internal.payments.record, {
      id,
      receipt: { ...receipt, status: "completed" },
    });
    await expect(
      t.action(api.paymentActions.requestRefund, sign(request)),
    ).rejects.toThrow("already resolved");
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
