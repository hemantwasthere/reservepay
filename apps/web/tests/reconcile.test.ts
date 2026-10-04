import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import { merchantAddress } from "@reservepay/core";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { DEVNET_USDC } from "../src/merchant/client";
import { signIn } from "./session";

const fns = vi.hoisted(() => ({ openOrders: vi.fn() }));
vi.mock("../src/payments/keeper-chain", () => ({ keeperChain: () => fns }));
const { readOrder, readOrders } = vi.hoisted(() => ({
  readOrder: vi.fn(),
  readOrders: vi.fn(),
}));
vi.mock("../src/payments/chain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/payments/chain")>();
  return { ...original, paymentClient: () => ({ readOrder, readOrders }) };
});
const modules = import.meta.glob("../convex/**/*.ts");

const buyer = Keypair.generate();
const reference = (n: number) => n.toString(16).padStart(32, "0");
const pdaOf = (wallet: Keypair) =>
  merchantAddress(wallet.publicKey, DEVNET_USDC).toBase58();
const openOrder = (wallet: Keypair, ref: string, order?: string) => ({
  order: order ?? Keypair.generate().publicKey.toBase58(),
  merchantPda: pdaOf(wallet),
  reference: ref,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});
const receipt = (order: string, status: "paid" | "completed" | "refunded") => ({
  order,
  buyer: buyer.publicKey.toBase58(),
  reserveAmount: "50000",
  createdAt: Date.now() - 3_600_000,
  expiresAt: Date.now() + 3_600_000,
  status,
});

async function insertLink(
  t: ReturnType<typeof convexTest>,
  wallet: Keypair,
  ref: string,
) {
  return t.mutation(internal.payments.insert, {
    merchant: wallet.publicKey.toBase58(),
    reference: ref,
    title: "Test order",
    amount: "1000000",
    protectionSeconds: 3600,
    issuedAt: Date.now(),
  });
}
// inserts rate-limit to 10 links per merchant per minute
async function insertLinks(
  t: ReturnType<typeof convexTest>,
  count: number,
  startRef: number,
  paid = false,
) {
  const ids = [];
  for (let i = 0; ids.length < count; i++) {
    const wallet = Keypair.generate();
    for (let j = 0; j < 10 && ids.length < count; j++) {
      const id = await insertLink(t, wallet, reference(startRef + ids.length));
      if (paid)
        await t.mutation(internal.payments.record, {
          id,
          receipt: receipt(Keypair.generate().publicKey.toBase58(), "paid"),
        });
      ids.push(id);
    }
  }
  return ids;
}

beforeEach(() => {
  delete process.env.KEEPER_SECRET_KEY;
  fns.openOrders.mockReset();
  fns.openOrders.mockResolvedValue([]);
  readOrder.mockReset();
  readOrders.mockReset();
  readOrders.mockImplementation(
    async (items: { id: string }[]) =>
      new Map(items.map(({ id }) => [id, null])),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reconcile run", () => {
  it("records a receipt for a link paid while no client was watching", async () => {
    const t = convexTest(schema, modules);
    const wallet = Keypair.generate();
    const id = await insertLink(t, wallet, reference(1));
    const order = openOrder(wallet, reference(1));
    fns.openOrders.mockResolvedValue([order]);
    readOrders.mockResolvedValue(new Map([[id, receipt(order.order, "paid")]]));
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result).toMatchObject({
      scanned: 1,
      scanFailed: false,
      synced: 1,
      mismatched: 0,
      failed: 0,
      skipped: [],
    });
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "paid",
    );
  });
  it("runs without KEEPER_SECRET_KEY", async () => {
    expect(process.env.KEEPER_SECRET_KEY).toBeUndefined();
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.reconcileActions.run, {}),
    ).resolves.toMatchObject({ failed: 0 });
  });
  it("ignores an open order whose reference matches but whose merchant does not", async () => {
    const t = convexTest(schema, modules);
    const owner = Keypair.generate(),
      other = Keypair.generate();
    const ref = reference(2);
    const ownerId = await insertLink(t, owner, ref);
    const otherId = await insertLink(t, other, ref);
    const order = openOrder(owner, ref);
    fns.openOrders.mockResolvedValue([order]);
    readOrders.mockImplementation(
      async (items: { id: string }[]) =>
        new Map(
          items.map(({ id }) => [
            id,
            id === ownerId ? receipt(order.order, "paid") : null,
          ]),
        ),
    );
    await t.action(internal.reconcileActions.run, {});
    // The merchant-PDA filter keeps only the owner's link in the first
    // (open-order scan) batch; the other link is left for the sweep.
    expect(readOrders.mock.calls[0][0].map(({ id }: { id: string }) => id))
      .toEqual([ownerId]);
    expect((await t.query(api.payments.get, { id: ownerId }))?.receipt?.status)
      .toBe("paid");
    expect((await t.query(api.payments.get, { id: otherId }))?.receipt)
      .toBeUndefined();
  });
  it("resolves a dispute in the same run even with more than 200 paid links", async () => {
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const disputeId = await insertLink(t, Keypair.generate(), reference(3));
    await t.mutation(internal.payments.requestRefund, {
      id: disputeId,
      receipt: receipt(orderAddress, "paid"),
      reason: "not_received",
    });
    await insertLinks(t, 201, 1000, true);
    readOrders.mockImplementation(
      async (items: { id: string }[]) =>
        new Map(
          items.map(({ id }) => [
            id,
            id === disputeId ? receipt(orderAddress, "refunded") : null,
          ]),
        ),
    );
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result.synced).toBeGreaterThanOrEqual(1);
    const dispute = await t.query(api.payments.get, { id: disputeId });
    expect(dispute?.receipt?.status).toBe("refunded");
    expect(dispute?.refundOutcome).toBe("refunded");
    expect(dispute?.refundPending).toBe(false);
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(0);
  });
  it("leaves a dispute whose order is still open", async () => {
    const t = convexTest(schema, modules);
    const wallet = Keypair.generate();
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, wallet, reference(4));
    await t.mutation(internal.payments.requestRefund, {
      id,
      receipt: receipt(orderAddress, "paid"),
      reason: "not_received",
    });
    fns.openOrders.mockResolvedValue([
      openOrder(wallet, reference(4), orderAddress),
    ]);
    await t.action(internal.reconcileActions.run, {});
    // The order is open, the link has a receipt and its receipt is not
    // stale, so no step reads anything.
    expect(readOrders).not.toHaveBeenCalled();
    const link = await t.query(api.payments.get, { id });
    expect(link?.refundPending).toBe(true);
    expect(link?.receipt?.status).toBe("paid");
  });
  it("advances a stale paid receipt whose order completed outside the app", async () => {
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, Keypair.generate(), reference(5));
    await t.mutation(internal.payments.record, {
      id,
      receipt: receipt(orderAddress, "paid"),
    });
    readOrders.mockResolvedValue(
      new Map([[id, receipt(orderAddress, "completed")]]),
    );
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result).toMatchObject({ synced: 1, failed: 0 });
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "completed",
    );
  });
  it("sweeps never-synced links, including deactivated ones", async () => {
    const t = convexTest(schema, modules);
    const active = Keypair.generate(),
      gone = Keypair.generate();
    const activeId = await insertLink(t, active, reference(6));
    const goneId = await insertLink(t, gone, reference(7));
    const { token: session } = await signIn(t, gone);
    await t.mutation(internal.payments.deactivate, { session, id: goneId });
    readOrders.mockImplementation(
      async (items: { id: string }[]) =>
        new Map(
          items.map(({ id }) => [
            id,
            receipt(Keypair.generate().publicKey.toBase58(), "completed"),
          ]),
        ),
    );
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result.synced).toBe(2);
    expect(
      (await t.query(api.payments.get, { id: activeId }))?.receipt?.status,
    ).toBe("completed");
    expect(
      (await t.query(api.payments.get, { id: goneId }))?.receipt?.status,
    ).toBe("completed");
  });
  it("advances the sweep cursor on success and resets it when done", async () => {
    const t = convexTest(schema, modules);
    await insertLinks(t, 201, 2000);
    const first = await t.action(internal.reconcileActions.run, {});
    expect(first.missing).toBe(200);
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).not.toBeNull();
    const second = await t.action(internal.reconcileActions.run, {});
    expect(second.missing).toBe(1);
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).toBeNull();
  });
  it("resumes after receipt writes remove the previous page from the index", async () => {
    const t = convexTest(schema, modules);
    const ids = await insertLinks(t, 201, 2500);
    readOrders.mockImplementation(
      async (items: { id: string }[]) =>
        new Map(
          items.map(({ id }) => [
            id,
            receipt(Keypair.generate().publicKey.toBase58(), "completed"),
          ]),
        ),
    );
    const first = await t.action(internal.reconcileActions.run, {});
    expect(first.synced).toBe(200);
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).not.toBeNull();
    const second = await t.action(internal.reconcileActions.run, {});
    expect(second.synced).toBe(1);
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).toBeNull();
    for (const id of ids)
      expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
        "completed",
      );
    expect(readOrders.mock.calls.flatMap(([items]) => items)).toHaveLength(201);
  });
  it("does not advance the cursor when a chunk read fails", async () => {
    const t = convexTest(schema, modules);
    await insertLinks(t, 201, 3000);
    readOrders.mockRejectedValue(new Error("503 Service Unavailable"));
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result.failed).toBe(200);
    expect(result.synced).toBe(0);
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).toBeNull();
  });
  it("resets a stored cursor that fails to page and skips that step", async () => {
    const t = convexTest(schema, modules);
    await insertLink(t, Keypair.generate(), reference(8));
    await t.mutation(internal.reconcile.setCursor, {
      name: "unsynced",
      cursor: "not-a-real-cursor",
    });
    const result = await t.action(internal.reconcileActions.run, {});
    expect(
      await t.query(internal.reconcile.getCursor, { name: "unsynced" }),
    ).toBeNull();
    // The failed page skipped the sweep, so nothing was read — and the
    // summary names the skipped step instead of looking like a quiet run.
    expect(result.skipped).toEqual(["unsynced"]);
    expect(readOrders).not.toHaveBeenCalled();
  });
  it("skips the open-order steps when the scan fails and never mass-syncs paid links", async () => {
    const t = convexTest(schema, modules);
    const wallet = Keypair.generate();
    const paidId = await insertLink(t, wallet, reference(9));
    await t.mutation(internal.payments.record, {
      id: paidId,
      receipt: receipt(Keypair.generate().publicKey.toBase58(), "paid"),
    });
    const unsyncedId = await insertLink(t, wallet, reference(10));
    fns.openOrders.mockRejectedValue(new Error("503 Service Unavailable"));
    const result = await t.action(internal.reconcileActions.run, {});
    // The failed scan is visible in the summary, not mistaken for a quiet run.
    expect(result).toMatchObject({
      scanned: 0,
      scanFailed: true,
      skipped: ["scan"],
    });
    expect((await t.query(api.workers.status, {}))[0]).toMatchObject({ issue: "failed", lastSuccessAt: null });
    // Only the catch-up sweep read anything; the paid link was untouched.
    expect(readOrders).toHaveBeenCalledTimes(1);
    expect(readOrders.mock.calls[0][0].map(({ id }: { id: string }) => id))
      .toEqual([unsyncedId]);
    expect((await t.query(api.payments.get, { id: paidId }))?.receipt?.status)
      .toBe("paid");
  });
  it("names the steps skipped when the time budget runs out", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await insertLink(t, Keypair.generate(), reference(14));
    fns.openOrders.mockImplementation(async () => {
      vi.advanceTimersByTime(91_000);
      return [];
    });
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result).toMatchObject({
      scanned: 0,
      scanFailed: false,
      skipped: ["disputes", "paid", "unsynced"],
    });
    expect((await t.query(api.workers.status, {}))[0]).toMatchObject({ issue: "incomplete", lastSuccessAt: null });
    expect(readOrders).not.toHaveBeenCalled();
  });
  it("counts mismatches without failing the batch", async () => {
    const t = convexTest(schema, modules);
    const a = await insertLink(t, Keypair.generate(), reference(11));
    const b = await insertLink(t, Keypair.generate(), reference(12));
    readOrders.mockResolvedValue(
      new Map<string, unknown>([
        [a, new Error("The on-chain order does not match this payment link.")],
        [
          b,
          receipt(Keypair.generate().publicKey.toBase58(), "paid"),
        ],
      ]),
    );
    const result = await t.action(internal.reconcileActions.run, {});
    expect(result).toMatchObject({ synced: 1, mismatched: 1, failed: 0 });
    expect((await t.query(api.payments.get, { id: b }))?.receipt?.status).toBe(
      "paid",
    );
  });
  it("never rolls a resolved receipt back to a stale paid read", async () => {
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, Keypair.generate(), reference(13));
    await t.mutation(internal.payments.requestRefund, {
      id,
      receipt: receipt(orderAddress, "paid"),
      reason: "not_received",
    });
    // The resolution landed through another path (e.g. the keeper) between
    // the reconciler's scan and its read; the stale read must be a no-op.
    const resolved = receipt(orderAddress, "completed");
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { receipt: resolved });
    });
    readOrders.mockResolvedValue(
      new Map([[id, receipt(orderAddress, "paid")]]),
    );
    await t.action(internal.reconcileActions.run, {});
    const link = await t.query(api.payments.get, { id });
    expect(link?.receipt).toEqual(resolved);
    expect(link?.refundPending).toBe(true);
  });
});
