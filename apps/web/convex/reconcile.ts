import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Reconciler queries. V8 functions must not import @solana/web3.js, so the
// merchant-PDA check runs in the calling action (reconcileActions.ts).
export const linksByReference = internalQuery({
  args: { references: v.array(v.string()) },
  handler: async (ctx, { references }) => {
    if (references.length > 100)
      throw new ConvexError("At most 100 references per request.");
    const byReference: Record<string, Doc<"paymentLinks">[]> = {};
    for (const reference of references) {
      const links = await ctx.db
        .query("paymentLinks")
        .withIndex("by_reference_only", (q) => q.eq("reference", reference))
        .collect();
      if (links.length > 0) byReference[reference] = links;
    }
    return byReference;
  },
});
export const paidLinks = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_receipt_status", (q) => q.eq("receipt.status", "paid"))
      .paginate(paginationOpts),
});
// Links with no receipt at all: Convex indexes a missing nested path as
// undefined. Deactivated links are included — a stale tab can still pay.
export const unsyncedLinks = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_receipt_status", (q) =>
        q.eq("receipt.status", undefined),
      )
      .paginate(paginationOpts),
});
export const getCursor = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    return state?.cursor ?? null;
  },
});
export const setCursor = internalMutation({
  args: { name: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { name, cursor }) => {
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (state) await ctx.db.patch(state._id, { cursor, updatedAt: Date.now() });
    else
      await ctx.db.insert("syncState", { name, cursor, updatedAt: Date.now() });
  },
});
