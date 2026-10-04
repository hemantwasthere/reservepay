import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const sessionKey = "a".repeat(64);
const otherSession = "b".repeat(64);
const payment = () => ({
  sessionKey,
  requestId: crypto.randomUUID(),
  amountCents: 10000,
  reserveBps: 500,
});

afterEach(() => vi.useRealTimers());

describe("demo payments", () => {
  it("computes settlement on the server and isolates browser histories", async () => {
    const t = convexTest(schema, modules);
    const order = await t.mutation(api.demoOrders.create, payment());
    expect(order).toMatchObject({
      amount: 100_000_000n,
      merchantAmount: 95_000_000n,
      reserveAmount: 5_000_000n,
      status: "paid",
    });
    expect(await t.query(api.demoOrders.list, { sessionKey })).toEqual([order]);
    expect(
      await t.query(api.demoOrders.list, { sessionKey: otherSession }),
    ).toEqual([]);
    expect(order).not.toHaveProperty("sessionKey");
    await expect(
      t.mutation(api.demoOrders.resolve, {
        sessionKey: otherSession,
        orderId: order.id,
        status: "refunded",
      }),
    ).rejects.toThrow("not found");
  });

  it("makes payment retries idempotent but rejects reused references with different amounts", async () => {
    const t = convexTest(schema, modules);
    const args = payment();
    const first = await t.mutation(api.demoOrders.create, args);
    const retry = await t.mutation(api.demoOrders.create, args);
    expect(retry.id).toBe(first.id);
    expect(await t.query(api.demoOrders.list, { sessionKey })).toHaveLength(1);
    await expect(
      t.mutation(api.demoOrders.create, { ...args, amountCents: 20000 }),
    ).rejects.toThrow("already been used");
  });

  it.each(["completed", "refunded"] as const)(
    "persists %s and refuses a conflicting resolution",
    async (status) => {
      const t = convexTest(schema, modules);
      const order = await t.mutation(api.demoOrders.create, payment());
      const args = { sessionKey, orderId: order.id, status };
      await t.mutation(api.demoOrders.resolve, args);
      expect((await t.mutation(api.demoOrders.resolve, args)).status).toBe(
        status,
      );
      expect(
        (await t.query(api.demoOrders.list, { sessionKey }))[0].status,
      ).toBe(status);
      await expect(
        t.mutation(api.demoOrders.resolve, {
          ...args,
          status: status === "completed" ? "refunded" : "completed",
        }),
      ).rejects.toThrow("already been resolved");
    },
  );

  it.each([
    { amountCents: 0 },
    { amountCents: 1000001 },
    { amountCents: 100.5 },
    { amountCents: Infinity },
    { reserveBps: 0 },
    { reserveBps: 1100 },
    { reserveBps: 555 },
    { sessionKey: "guessable" },
  ])("rejects invalid input %j", async (invalid) => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.demoOrders.create, { ...payment(), ...invalid }),
    ).rejects.toThrow();
    expect(await t.query(api.demoOrders.list, { sessionKey })).toHaveLength(0);
  });

  it("limits rapid demo writes", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 20; i++)
      await t.mutation(api.demoOrders.create, payment());
    await expect(t.mutation(api.demoOrders.create, payment())).rejects.toThrow(
      "wait a minute",
    );
  });

  it("caps demo writes globally across rotating session keys", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    for (let i = 0; i < 60; i++)
      await t.mutation(api.demoOrders.create, {
        ...payment(),
        sessionKey: i.toString(16).padStart(64, "0"),
      });
    await expect(
      t.mutation(api.demoOrders.create, {
        ...payment(),
        sessionKey: "f".repeat(64),
      }),
    ).rejects.toThrow("busy");
    vi.advanceTimersByTime(61_000);
    const order = await t.mutation(api.demoOrders.create, {
      ...payment(),
      sessionKey: "f".repeat(64),
    });
    expect(order.status).toBe("paid");
  });

  it("expires demo rows after 24 hours in batches", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 600; i++)
        await ctx.db.insert("demoOrders", {
          sessionKey: otherSession,
          requestId: crypto.randomUUID(),
          amount: 100_000_000n,
          merchantAmount: 95_000_000n,
          reserveAmount: 5_000_000n,
          reserveBps: 500,
          status: "paid",
        });
    });
    vi.advanceTimersByTime(25 * 60 * 60_000);
    const fresh = await t.mutation(api.demoOrders.create, payment());
    expect(await t.mutation(internal.demoOrders.cleanup, {})).toBe(500);
    // A full batch reschedules itself until the backlog is drained.
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1_000));
    expect(await t.run((ctx) => ctx.db.query("demoOrders").collect())).toEqual([
      expect.objectContaining({ _id: fresh.id }),
    ]);
    expect(await t.query(api.demoOrders.list, { sessionKey })).toEqual([fresh]);
  });
});
