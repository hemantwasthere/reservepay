import { ConvexError, v } from "convex/values";
import { calculateSettlement } from "@reservepay/core/settlement";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { SWEEP_BATCH, sweepExpired } from "./cleanup";

function validateKey(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new ConvexError("Invalid demo session.");
  }
}

function publicOrder(order: Doc<"demoOrders">) {
  return {
    id: order._id,
    createdAt: order._creationTime,
    amount: order.amount,
    merchantAmount: order.merchantAmount,
    reserveAmount: order.reserveAmount,
    reserveBps: order.reserveBps,
    status: order.status,
  };
}

export const list = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, { sessionKey }) => {
    validateKey(sessionKey);
    const orders = await ctx.db
      .query("demoOrders")
      .withIndex("by_session", (q) => q.eq("sessionKey", sessionKey))
      .order("desc")
      .take(20);
    return orders.map(publicOrder);
  },
});

export const create = mutation({
  args: {
    sessionKey: v.string(),
    requestId: v.string(),
    amountCents: v.number(),
    reserveBps: v.number(),
  },
  handler: async (ctx, { sessionKey, requestId, amountCents, reserveBps }) => {
    validateKey(sessionKey);
    if (!/^[a-f0-9-]{36}$/.test(requestId))
      throw new ConvexError("Invalid payment reference.");
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < 100 ||
      amountCents > 1_000_000
    ) {
      throw new ConvexError("Enter an amount between $1 and $10,000.");
    }
    if (
      !Number.isInteger(reserveBps) ||
      reserveBps < 100 ||
      reserveBps > 1000 ||
      reserveBps % 100 !== 0
    ) {
      throw new ConvexError("Choose a reserve rate between 1% and 10%.");
    }
    const previous = await ctx.db
      .query("demoOrders")
      .withIndex("by_request", (q) =>
        q.eq("sessionKey", sessionKey).eq("requestId", requestId),
      )
      .unique();
    if (previous) {
      if (
        previous.amount !== BigInt(amountCents) * 10_000n ||
        previous.reserveBps !== reserveBps
      ) {
        throw new ConvexError("This payment reference has already been used.");
      }
      return publicOrder(previous);
    }
    const recent = await ctx.db
      .query("demoOrders")
      .withIndex("by_session", (q) =>
        q
          .eq("sessionKey", sessionKey)
          .gte("_creationTime", Date.now() - 60_000),
      )
      .take(20);
    if (recent.length >= 20)
      throw new ConvexError(
        "Please wait a minute before making another demo payment.",
      );
    // The session key is client-chosen, so the per-session cap alone is
    // bypassed by rotating keys. A global cap is acceptable here because the
    // demo has no real users to lock out — never do this for payments or
    // sign-in. Mutations are OCC-serializable, so count-then-insert is exact.
    const globalRecent = await ctx.db
      .query("demoOrders")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", Date.now() - 60_000),
      )
      .take(60);
    if (globalRecent.length >= 60)
      throw new ConvexError(
        "The demo is busy right now. Please try again in a minute.",
      );
    const settlement = calculateSettlement(
      BigInt(amountCents) * 10_000n,
      reserveBps,
    );
    const id = await ctx.db.insert("demoOrders", {
      sessionKey,
      requestId,
      ...settlement,
      status: "paid",
    });
    const order = await ctx.db.get(id);
    if (!order) throw new ConvexError("Could not save the demo payment.");
    return publicOrder(order);
  },
});

// Cron entry point. The demo is a simulation, so rows expire after 24 hours.
// Deletes in bounded, indexed batches and reschedules itself until the
// backlog is drained (mirrors auth.cleanup).
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await sweepExpired(ctx, {
      table: "demoOrders",
      index: "by_creation_time",
      field: "_creationTime",
      cutoff: Date.now() - 24 * 60 * 60_000,
    });
    if (deleted === SWEEP_BATCH)
      await ctx.scheduler.runAfter(0, internal.demoOrders.cleanup, {});
    return deleted;
  },
});

// A get plus one patch of the caller's own row: one-way transition, no
// insert, no RPC. Harmless without a rate cap.
export const resolve = mutation({
  args: {
    sessionKey: v.string(),
    orderId: v.id("demoOrders"),
    status: v.union(v.literal("completed"), v.literal("refunded")),
  },
  handler: async (ctx, { sessionKey, orderId, status }) => {
    validateKey(sessionKey);
    const order = await ctx.db.get(orderId);
    if (!order || order.sessionKey !== sessionKey)
      throw new ConvexError("Demo payment not found.");
    if (order.status === status) return publicOrder(order);
    if (order.status !== "paid")
      throw new ConvexError("This demo payment has already been resolved.");
    await ctx.db.patch(orderId, { status, resolvedAt: Date.now() });
    return publicOrder({ ...order, status });
  },
});
