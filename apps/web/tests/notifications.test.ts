import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Keypair } from "@solana/web3.js";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { signIn } from "./session";
import type { Doc } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const merchant = Keypair.generate(),
  buyer = Keypair.generate(),
  resolver = Keypair.generate();
const wallet = merchant.publicKey.toBase58();
const { readResolver } = vi.hoisted(() => ({ readResolver: vi.fn() }));
vi.mock("../src/payments/chain", () => ({
  paymentClient: () => ({ readResolver }),
}));
beforeEach(() => readResolver.mockResolvedValue(resolver.publicKey));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const now = () => Date.now();
const receipt = (expiresAt = now() + 3_600_000) => ({
  order: Keypair.generate().publicKey.toBase58(),
  buyer: buyer.publicKey.toBase58(),
  reserveAmount: "50000",
  createdAt: now() - 1_000,
  expiresAt,
  status: "paid" as const,
});
async function link(
  t: ReturnType<typeof convexTest>,
  expiresAt?: number,
  extra: Partial<Doc<"paymentLinks">> = {},
) {
  const data = {
    merchant: wallet,
    title: "Protected order",
    reference: "a".repeat(32),
    amount: "1000000",
    protectionSeconds: 3600,
    issuedAt: now(),
    receipt: receipt(expiresAt),
    ...extra,
  };
  const id = await t.run((ctx) => ctx.db.insert("paymentLinks", data));
  return { id, receipt: data.receipt };
}
const rows = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.query("notifications").collect());
const sweep = (
  t: ReturnType<typeof convexTest>,
  kind: "disputes" | "deadlines" = "deadlines",
  recipient = resolver.publicKey.toBase58(),
) => t.mutation(internal.notifications.sweep, { kind, resolver: recipient });

it("delivers requests once and preserves read state across retries and resolution", async () => {
  const t = convexTest(schema, modules);
  const order = await link(t);
  const session = await signIn(t, merchant);
  const request = { ...order, reason: "not_received" as const };
  await t.mutation(internal.payments.requestRefund, request);
  await t.mutation(internal.payments.requestRefund, request);
  expect(await rows(t)).toHaveLength(2);
  await sweep(t, "disputes");
  const requestRows = (await rows(t)).filter(
    (row) => row.kind === "refund_requested",
  );
  expect(requestRows).toHaveLength(3);
  const own = requestRows.find((row) => row.wallet === wallet)!;
  await t.mutation(api.notifications.markRead, {
    session: session.token,
    ids: [own._id],
  });
  const readAt = (await rows(t)).find((row) => row._id === own._id)!.readAt;
  await sweep(t, "disputes");
  const resolved = {
    id: order.id,
    receipt: { ...order.receipt, status: "refunded" as const },
  };
  await t.mutation(internal.payments.record, resolved);
  await t.mutation(internal.payments.record, resolved);
  await t.mutation(internal.payments.record, order); // slow paid response
  expect((await rows(t)).filter((row) => row.kind === "refunded")).toHaveLength(
    3,
  );
  expect((await rows(t)).find((row) => row._id === own._id)!.readAt).toBe(
    readAt,
  );
  expect(
    (await t.query(api.payments.get, { id: order.id }))?.receipt?.status,
  ).toBe("refunded");
});

it("requires a valid session and isolates both inbox contents and read mutations", async () => {
  const t = convexTest(schema, modules);
  await link(t);
  await sweep(t);
  const a = await signIn(t, merchant),
    b = await signIn(t, buyer);
  const page = await t.query(api.notifications.list, {
    session: a.token,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(page.page).toHaveLength(1);
  expect(page.page[0].wallet).toBe(wallet);
  const foreign = (await rows(t)).find((row) => row.wallet !== wallet)!;
  await expect(
    t.mutation(api.notifications.markRead, {
      session: a.token,
      ids: [page.page[0]._id, foreign._id],
    }),
  ).rejects.toThrow("Update not found");
  // The failed mixed batch rolls back even the first, owned row.
  expect(await t.query(api.notifications.unread, { session: a.token })).toEqual(
    { count: 1, more: false },
  );
  await t.mutation(api.notifications.markRead, {
    session: a.token,
    ids: [page.page[0]._id],
  });
  expect(await t.query(api.notifications.unread, { session: a.token })).toEqual(
    { count: 0, more: false },
  );
  expect(await t.query(api.notifications.unread, { session: b.token })).toEqual(
    { count: 1, more: false },
  );
  await expect(
    t.query(api.notifications.list, {
      session: "invalid",
      paginationOpts: { numItems: 20, cursor: null },
    }),
  ).rejects.toThrow("Sign in again");
  await t.mutation(api.auth.signOut, { session: a.token });
  await expect(
    t.mutation(api.notifications.markRead, { session: a.token, ids: [] }),
  ).rejects.toThrow("Sign in again");
});

it("sends the one-hour reminder and expiry update once, never for resolved orders", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const due = await link(t, now() + 3_600_000);
  await link(t, now() + 3_600_001);
  const resolved = await link(t, now() + 500);
  await t.mutation(internal.payments.record, {
    id: resolved.id,
    receipt: { ...resolved.receipt, status: "completed" },
  });
  await sweep(t);
  await sweep(t);
  expect(
    (await rows(t)).filter((row) => row.kind === "protection_ending"),
  ).toHaveLength(2);
  vi.advanceTimersByTime(3_600_000);
  await sweep(t);
  const ended = (await rows(t)).filter(
    (row) => row.kind === "protection_ended",
  );
  expect(ended).toHaveLength(2);
  expect(ended.every((row) => row.linkId === due.id)).toBe(true);
  expect(
    (await rows(t))
      .filter((row) => row.linkId === resolved.id)
      .every((row) => row.kind === "completed"),
  ).toBe(true);
});

it("catches overdue requests and resolver rotation without notifying an arbitrary caller", async () => {
  const t = convexTest(schema, modules);
  const order = await link(t, now() - 1000, {
    refundPending: true,
    refundRequest: { reason: "not_received", requestedAt: now() - 2000 },
  });
  await sweep(t, "disputes");
  const next = Keypair.generate().publicKey.toBase58();
  await sweep(t, "disputes", next);
  const delivered = await rows(t);
  expect(
    delivered.filter((row) => row.kind === "refund_requested"),
  ).toHaveLength(4);
  expect(
    delivered.filter((row) => row.kind === "protection_ended"),
  ).toHaveLength(4);
  expect(delivered.some((row) => row.kind === "protection_ending")).toBe(false);
  await t.mutation(internal.payments.record, {
    id: order.id,
    receipt: { ...order.receipt, status: "completed" },
  });
  expect(
    (await rows(t))
      .filter((row) => row.kind === "completed")
      .map((row) => row.wallet),
  ).toContain(next);
});

it("reaches deadlines beyond the first page and caps unread counts", async () => {
  const t = convexTest(schema, modules);
  for (let i = 0; i < 201; i++) await link(t, now() - 1000);
  expect(await sweep(t)).toMatchObject({ scanned: 200, created: 400 });
  expect(await sweep(t)).toMatchObject({ scanned: 1, created: 2 });
  expect(await sweep(t)).toMatchObject({ scanned: 200, created: 0 });
  const session = await signIn(t, merchant);
  expect(
    await t.query(api.notifications.unread, { session: session.token }),
  ).toEqual({ count: 99, more: true });
  const first = await t.query(api.notifications.list, {
    session: session.token,
    paginationOpts: { numItems: 20, cursor: null },
  });
  const next = await t.query(api.notifications.list, {
    session: session.token,
    paginationOpts: { numItems: 20, cursor: first.continueCursor },
  });
  expect(
    new Set([...first.page, ...next.page].map((row) => row._id)).size,
  ).toBe(40);
});

it("recovers an invalid stored cursor instead of permanently stopping reminders", async () => {
  const t = convexTest(schema, modules);
  await link(t);
  await t.mutation(internal.reconcile.setCursor, {
    name: "notifications:deadlines",
    cursor: "invalid-cursor",
  });
  expect(await sweep(t)).toMatchObject({ restarted: true });
  expect(await sweep(t)).toMatchObject({ created: 2, restarted: false });
});

it("continues wallet reminders during resolver RPC failure and recovers without duplicates", async () => {
  const t = convexTest(schema, modules);
  await link(t, now() + 1000, {
    refundPending: true,
    refundRequest: { reason: "cancellation", requestedAt: now() },
  });
  readResolver.mockRejectedValueOnce(
    new Error("https://private.example/api-secret"),
  );
  expect(await t.action(internal.notificationActions.run, {})).toMatchObject({
    resolverUnavailable: true,
    created: 4,
  });
  expect(
    (await t.query(api.workers.status, {})).find(
      (row) => row.name === "notifications",
    )?.issue,
  ).toBe("failed");
  expect(await t.action(internal.notificationActions.run, {})).toMatchObject({
    resolverUnavailable: false,
    created: 2,
  });
  expect(
    (await t.query(api.workers.status, {})).find(
      (row) => row.name === "notifications",
    )?.issue,
  ).toBeNull();
  expect(await t.action(internal.notificationActions.run, {})).toMatchObject({
    created: 0,
  });
});

it("deduplicates overlapping merchant, buyer and resolver roles", async () => {
  const t = convexTest(schema, modules);
  const order = await link(t);
  await t.run((ctx) =>
    ctx.db.patch(order.id, {
      receipt: { ...order.receipt, buyer: wallet },
      refundPending: true,
    }),
  );
  await sweep(t, "disputes", wallet);
  expect(await rows(t)).toHaveLength(2);
});
