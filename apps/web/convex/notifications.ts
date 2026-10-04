import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireMerchant } from "./session";
import { notifyOrder } from "./notificationEvents";

export const list = query({
  args: { session: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { session, paginationOpts }) => {
    const wallet = await requireMerchant(ctx, session);
    return ctx.db
      .query("notifications")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 50),
      });
  },
});
export const unread = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const wallet = await requireMerchant(ctx, session);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_unread", (q) =>
        q.eq("wallet", wallet).eq("readAt", undefined),
      )
      .take(100);
    return { count: Math.min(rows.length, 99), more: rows.length > 99 };
  },
});
export const markRead = mutation({
  args: { session: v.string(), ids: v.array(v.id("notifications")) },
  handler: async (ctx, { session, ids }) => {
    const wallet = await requireMerchant(ctx, session);
    if (ids.length > 50)
      throw new ConvexError("Mark at most 50 updates at a time.");
    for (const id of new Set(ids)) {
      const row = await ctx.db.get(id);
      if (!row || row.wallet !== wallet)
        throw new ConvexError("Update not found.");
      if (row.readAt === undefined)
        await ctx.db.patch(id, { readAt: Date.now() });
    }
  },
});

// Two independent indexed sweeps: pending disputes (including resolver
// rotation/backfill), and paid orders whose deadline is within one hour.
// Persist the cursor in the same transaction as delivery. Failures retry the
// page; old overdue orders cannot permanently block newer reminders.
export const sweep = internalMutation({
  args: {
    kind: v.union(v.literal("disputes"), v.literal("deadlines")),
    resolver: v.optional(v.string()),
  },
  handler: async (ctx, { kind, resolver }) => {
    const name = `notifications:${kind}`;
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    const now = Date.now();
    const query =
      kind === "disputes"
        ? ctx.db
            .query("paymentLinks")
            .withIndex("by_refund_expiry", (q) => q.eq("refundPending", true))
        : ctx.db
            .query("paymentLinks")
            .withIndex("by_paid_expiry", (q) =>
              q
                .eq("receipt.status", "paid")
                .lte("receipt.expiresAt", now + 3_600_000),
            );
    let page;
    try {
      page = await query.paginate({
        numItems: 200,
        cursor: state?.cursor ?? null,
      });
    } catch (error) {
      if (!state?.cursor) throw error;
      await ctx.db.patch(state._id, { cursor: null, updatedAt: now });
      return { created: 0, scanned: 0, restarted: true };
    }
    let created = 0;
    for (const link of page.page) {
      if (!link.receipt || link.receipt.status !== "paid") continue;
      const recipients = [
        link.merchant,
        link.receipt.buyer,
        ...(link.refundPending ? [resolver] : []),
      ];
      if (link.refundPending) {
        created += await notifyOrder(ctx, link, "refund_requested", recipients);
        if (resolver && link.refundNotifiedResolver !== resolver)
          await ctx.db.patch(link._id, { refundNotifiedResolver: resolver });
      }
      if (link.receipt.expiresAt <= now)
        created += await notifyOrder(ctx, link, "protection_ended", recipients);
      else if (link.receipt.expiresAt <= now + 3_600_000)
        created += await notifyOrder(
          ctx,
          link,
          "protection_ending",
          recipients,
        );
    }
    const fields = {
      name,
      cursor: page.isDone ? null : page.continueCursor,
      updatedAt: now,
    };
    if (state) await ctx.db.patch(state._id, fields);
    else await ctx.db.insert("syncState", fields);
    return { created, scanned: page.page.length, restarted: false };
  },
});
