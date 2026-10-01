import { ConvexError, v } from "convex/values";
import { calculateSettlement } from "@reservepay/core/settlement";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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
