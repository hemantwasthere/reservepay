import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { selectReleasable, type KeeperOrder } from "../src/payments/keeper";

const fns = vi.hoisted(() => ({
  balance: vi.fn(),
  openOrders: vi.fn(),
  merchant: vi.fn(),
  ataExists: vi.fn(),
  chainTime: vi.fn(),
  send: vi.fn(),
}));
vi.mock("../src/payments/keeper-chain", () => ({ keeperChain: () => fns }));
const { readOrder } = vi.hoisted(() => ({ readOrder: vi.fn() }));
vi.mock("../src/payments/chain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/payments/chain")>();
  return { ...original, paymentClient: () => ({ readOrder }) };
});
const modules = import.meta.glob("../convex/**/*.ts");

const keeper = Keypair.generate();
const authority = Keypair.generate();
const buyer = Keypair.generate();
const mint = Keypair.generate().publicKey.toBase58();
const merchantPda = Keypair.generate().publicKey.toBase58();
const reference = "ab".repeat(16);
const SECRET = bs58.encode(keeper.secretKey);

const openOrder = (expiresAt: number, order?: string) => ({
  order: order ?? Keypair.generate().publicKey.toBase58(),
  merchantPda,
  reference,
  expiresAt,
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
  order: string,
  refundPending = false,
) {
  const id = await t.mutation(internal.payments.insert, {
    merchant: authority.publicKey.toBase58(),
    reference,
    title: "Test order",
    amount: "1000000",
    protectionSeconds: 3600,
    issuedAt: Date.now(),
  });
  if (refundPending)
    await t.mutation(internal.payments.requestRefund, {
      id,
      receipt: receipt(order, "paid"),
      reason: "not_received",
    });
  return id;
}

beforeEach(() => {
  process.env.KEEPER_SECRET_KEY = SECRET;
  for (const fn of Object.values(fns)) fn.mockReset();
  readOrder.mockReset();
  readOrder.mockResolvedValue(null);
  fns.balance.mockResolvedValue(1_000_000_000);
  fns.openOrders.mockResolvedValue([]);
  fns.merchant.mockResolvedValue({
    authority: authority.publicKey.toBase58(),
    mint,
  });
  fns.ataExists.mockResolvedValue(true);
  fns.chainTime.mockResolvedValue(2_000_000n);
  fns.send.mockResolvedValue("keeper-transaction-signature");
});
afterEach(() => {
  delete process.env.KEEPER_SECRET_KEY;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("selectReleasable", () => {
  const order = (expiresAt: number, extra: Partial<KeeperOrder> = {}) => ({
    order: `order-${expiresAt}`,
    merchantPda: "merchant",
    authority: "authority",
    reference: "reference",
    expiresAt,
    ...extra,
  });
  it("selects only when the chain clock passed expiry and wall time is 60s past it", () => {
    // The chain clock has not reached expiry; the program would reject it.
    expect(
      selectReleasable({
        openOrders: [order(1000)],
        links: {},
        chainNow: 999,
        wallNow: 2_000_000,
      }),
    ).toHaveLength(0);
    // Expired on-chain, but a refund request could still be committed.
    expect(
      selectReleasable({
        openOrders: [order(1000)],
        links: {},
        chainNow: 1000,
        wallNow: 1_059_999,
      }),
    ).toHaveLength(0);
    expect(
      selectReleasable({
        openOrders: [order(1000)],
        links: {},
        chainNow: 1000,
        wallNow: 1_060_000,
      }),
    ).toHaveLength(1);
  });
  it("does not confuse seconds and milliseconds", () => {
    // 61_000 ms of wall time is 61 seconds, far before the 1_000_000 ms
    // expiry. Dropping the *1000 would wrongly accept 1000 + 60_000 <= 61_000.
    expect(
      selectReleasable({
        openOrders: [order(1000)],
        links: {},
        chainNow: 2000,
        wallNow: 61_000,
      }),
    ).toHaveLength(0);
  });
  it("does not select an order whose expiry sits between the two clocks", () => {
    // Past expiry on-chain, but wall time has not even reached expiry yet.
    expect(
      selectReleasable({
        openOrders: [order(1000)],
        links: {},
        chainNow: 1000,
        wallNow: 1_000_000,
      }),
    ).toHaveLength(0);
  });
  it("sorts oldest expiry first and caps at the limit", () => {
    const selected = selectReleasable({
      openOrders: [7000, 3000, 1000, 6000, 2000, 5000, 4000].map((expiresAt) =>
        order(expiresAt),
      ),
      links: {},
      chainNow: 10_000,
      wallNow: 11_000_000,
      limit: 5,
    });
    expect(selected.map((order) => order.expiresAt)).toEqual([
      1000, 2000, 3000, 4000, 5000,
    ]);
  });
  it("never selects a disputed order and releases unlinked ones", () => {
    const selected = selectReleasable({
      openOrders: [
        order(1000, { authority: "a1", reference: "r1" }),
        order(2000, { authority: "a2", reference: "r2" }),
        order(3000, { authority: "a3", reference: "r3" }),
      ],
      links: {
        "a1:r1": { id: "link-1", refundPending: true },
        "a2:r2": { id: "link-2", refundPending: false },
      },
      chainNow: 4000,
      wallNow: 5_000_000,
    });
    expect(selected.map((order) => order.reference)).toEqual(["r2", "r3"]);
    expect(selected[0].linkId).toBe("link-2");
    expect(selected[1].linkId).toBeUndefined();
  });
});

describe("keeper run", () => {
  it("returns unconfigured without a valid secret and never throws", async () => {
    delete process.env.KEEPER_SECRET_KEY;
    const t = convexTest(schema, modules);
    await expect(t.action(internal.keeperActions.run, {})).resolves.toEqual({
      skipped: "unconfigured",
    });
    process.env.KEEPER_SECRET_KEY = "not-a-base58-secret!!";
    await expect(t.action(internal.keeperActions.run, {})).resolves.toEqual({
      skipped: "unconfigured",
    });
    expect(fns.openOrders).not.toHaveBeenCalled();
  });
  it("counts a failed scan instead of reporting a successful empty run", async () => {
    const t = convexTest(schema, modules);
    fns.openOrders.mockRejectedValue(new Error("RPC unavailable"));
    await expect(
      t.action(internal.keeperActions.run, {}),
    ).resolves.toMatchObject({ failed: 1 });
    expect(fns.send).not.toHaveBeenCalled();
  });
  it("counts a failed dispute sync", async () => {
    const t = convexTest(schema, modules);
    await insertLink(t, Keypair.generate().publicKey.toBase58(), true);
    readOrder.mockRejectedValue(new Error("RPC unavailable"));
    await expect(
      t.action(internal.keeperActions.run, {}),
    ).resolves.toMatchObject({ failed: 1 });
  });
  it("does not log private RPC URLs on failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    fns.openOrders.mockRejectedValue(
      new Error("https://rpc.example/private-api-key"),
    );
    await t.action(internal.keeperActions.run, {});
    expect(error.mock.calls.flat().map(String).join(" ")).not.toContain(
      "private-api-key",
    );
  });
  it("releases an expired undisputed order and syncs the receipt after 90s", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, orderAddress);
    fns.openOrders.mockResolvedValue([openOrder(1_000_000, orderAddress)]);
    const result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 1, skipped: 0, failed: 0, synced: 0 });
    expect(fns.send).toHaveBeenCalledTimes(1);
    expect(fns.send.mock.calls[0][1].publicKey.toBase58()).toBe(
      keeper.publicKey.toBase58(),
    );
    // Not synced yet: finalization takes time, so the sync is scheduled.
    expect((await t.query(api.payments.get, { id }))?.receipt).toBeUndefined();
    readOrder.mockResolvedValue(receipt(orderAddress, "completed"));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "completed",
    );
  });
  it("skips an order whose merchant token account is missing", async () => {
    const t = convexTest(schema, modules);
    fns.openOrders.mockResolvedValue([openOrder(1_000_000)]);
    fns.ataExists.mockResolvedValue(false);
    const result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 0, skipped: 1, failed: 0, synced: 0 });
    expect(fns.send).not.toHaveBeenCalled();
  });
  it("does not let five older orders with missing token accounts starve a releasable order", async () => {
    const t = convexTest(schema, modules);
    const blockedAuthority = Keypair.generate().publicKey.toBase58();
    const healthyMerchant = Keypair.generate().publicKey.toBase58();
    const orders = Array.from({ length: 6 }, (_, index) => ({
      ...openOrder(900_000 + index),
      merchantPda: index === 5 ? healthyMerchant : merchantPda,
    }));
    fns.openOrders.mockResolvedValue(orders);
    fns.merchant.mockImplementation(async (address: string) => ({
      authority:
        address === healthyMerchant
          ? authority.publicKey.toBase58()
          : blockedAuthority,
      mint,
    }));
    fns.ataExists.mockImplementation(async (_mint, owner) =>
      owner.equals(authority.publicKey),
    );

    const result = await t.action(internal.keeperActions.run, {});

    expect(result).toEqual({ released: 1, skipped: 5, failed: 0, synced: 0 });
    expect(fns.send).toHaveBeenCalledTimes(1);
  });
  it("advances past repeatedly failing orders on the next run", async () => {
    const t = convexTest(schema, modules);
    const orders = Array.from({ length: 6 }, (_, i) => openOrder(900_000 + i));
    fns.openOrders.mockResolvedValue(orders);
    fns.send.mockImplementation(async (instructions) => {
      if (instructions[0].keys[2].pubkey.toBase58() !== orders[5].order)
        throw new Error("frozen token account");
      return "healthy-order-signature";
    });
    expect(await t.action(internal.keeperActions.run, {})).toMatchObject({
      failed: 5,
    });
    // The sixth, healthy order is now first in the next batch.
    expect(await t.action(internal.keeperActions.run, {})).toMatchObject({
      released: 1,
    });
  });
  it("persists missing configuration, low funds, failure and recovery", async () => {
    const t = convexTest(schema, modules);
    const status = async () =>
      (await t.query(api.workers.status, {})).find(
        (row) => row.name === "keeper",
      );
    delete process.env.KEEPER_SECRET_KEY;
    await t.action(internal.keeperActions.run, {});
    expect(await status()).toMatchObject({
      issue: "unconfigured",
      lastSuccessAt: null,
    });
    process.env.KEEPER_SECRET_KEY = SECRET;
    fns.balance.mockResolvedValue(0);
    await t.action(internal.keeperActions.run, {});
    expect(await status()).toMatchObject({
      issue: "low_funds",
      lastSuccessAt: null,
    });
    fns.balance.mockResolvedValue(1_000_000_000);
    fns.openOrders.mockRejectedValueOnce(new Error("unavailable"));
    await t.action(internal.keeperActions.run, {});
    expect(await status()).toMatchObject({
      issue: "failed",
      lastSuccessAt: null,
    });
    await t.action(internal.keeperActions.run, {});
    expect(await status()).toMatchObject({
      issue: null,
      lastSuccessAt: expect.any(Number),
    });
  });
  it("blocks release when a refund request is pending", async () => {
    const t = convexTest(schema, modules);
    // A request filed 30s before expiry is still pending at release time.
    const orderAddress = Keypair.generate().publicKey.toBase58();
    await insertLink(t, orderAddress, true);
    fns.openOrders.mockResolvedValue([openOrder(1_000_000, orderAddress)]);
    const result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 0, skipped: 0, failed: 0, synced: 0 });
    expect(fns.send).not.toHaveBeenCalled();
    // The dispute is still open on-chain, so reconciliation leaves it alone.
    expect(readOrder).not.toHaveBeenCalled();
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(1);
  });
  it("releases nothing when the run ends before every refund request is checked", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    // A disputed order must never be released, even in a truncated run.
    const orderAddress = Keypair.generate().publicKey.toBase58();
    await insertLink(t, orderAddress, true);
    fns.openOrders.mockResolvedValue([openOrder(1_000_000, orderAddress)]);
    // The merchant read exhausts the 4-minute budget, so the refund-request
    // check never runs and the order would look unlinked.
    fns.merchant.mockImplementation(async () => {
      vi.advanceTimersByTime(5 * 60_000);
      return { authority: authority.publicKey.toBase58(), mint };
    });
    const result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 0, skipped: 0, failed: 0, synced: 0 });
    expect(fns.send).not.toHaveBeenCalled();
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(1);
  });
  it("keeps releasing after one send fails and counts races as skipped", async () => {
    const t = convexTest(schema, modules);
    fns.openOrders.mockResolvedValue([
      openOrder(1_000_000),
      openOrder(900_000),
    ]);
    fns.send.mockReset();
    fns.send
      .mockRejectedValueOnce(new Error("insufficient funds"))
      .mockResolvedValueOnce("second-signature");
    let result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 1, skipped: 0, failed: 1, synced: 0 });
    fns.send.mockReset();
    fns.send.mockRejectedValue(
      new Error(
        "custom program error: OrderClosed: the order has already been resolved",
      ),
    );
    result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 0, skipped: 2, failed: 0, synced: 0 });
  });
  it("reconciles a dispute whose order is no longer open on-chain", async () => {
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, orderAddress, true);
    readOrder.mockResolvedValue(receipt(orderAddress, "refunded"));
    const result = await t.action(internal.keeperActions.run, {});
    expect(result).toEqual({ released: 0, skipped: 0, failed: 0, synced: 1 });
    const link = await t.query(api.payments.get, { id });
    expect(link?.receipt?.status).toBe("refunded");
    expect(link?.refundOutcome).toBe("refunded");
    expect(link?.refundPending).toBe(false);
    expect(await t.query(api.payments.refundQueue, {})).toHaveLength(0);
  });
  it("never leaks the secret in the result or the logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.KEEPER_SECRET_KEY;
    let t = convexTest(schema, modules);
    await t.action(internal.keeperActions.run, {});
    process.env.KEEPER_SECRET_KEY = SECRET;
    t = convexTest(schema, modules);
    fns.openOrders.mockResolvedValue([openOrder(1_000_000)]);
    fns.send.mockRejectedValue(new Error("boom"));
    const result = await t.action(internal.keeperActions.run, {});
    const logged = [...log.mock.calls, ...error.mock.calls]
      .map((call) => call.map(String).join(" "))
      .join("\n");
    expect(logged).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe("receipt non-regression", () => {
  it("public sync skips resolved receipts; syncById cannot regress them", async () => {
    const t = convexTest(schema, modules);
    const orderAddress = Keypair.generate().publicKey.toBase58();
    const id = await insertLink(t, orderAddress);
    readOrder.mockResolvedValue(receipt(orderAddress, "completed"));
    await expect(t.action(api.paymentActions.sync, { id })).resolves.toBe(true);
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "completed",
    );
    // The public sync short-circuits resolved receipts, so the stale re-read
    // goes through the internal path: record must refuse to regress it.
    readOrder.mockResolvedValue(receipt(orderAddress, "paid"));
    await t.action(internal.paymentActions.syncById, { id });
    expect((await t.query(api.payments.get, { id }))?.receipt?.status).toBe(
      "completed",
    );
    // An unpaid link with no order on chain still reports false.
    const unpaid = await t.mutation(internal.payments.insert, {
      merchant: Keypair.generate().publicKey.toBase58(),
      reference,
      title: "Test order",
      amount: "1000000",
      protectionSeconds: 3600,
      issuedAt: Date.now(),
    });
    readOrder.mockResolvedValue(null);
    await expect(
      t.action(api.paymentActions.sync, { id: unpaid }),
    ).resolves.toBe(false);
  });
});
