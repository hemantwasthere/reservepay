import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Link lookup for the keeper, keyed "authority:reference" to match
// selectReleasable. At most 50 references per call.
// It also returns `now` on the Convex backend clock — the same clock
// payments.requestRefund uses to refuse late requests — and the keeper
// decides every release cutoff against it, never against its own Node
// runtime clock, which nothing keeps in sync with the backend. That covers
// orders with no link too: a merchant can create a link for an existing
// on-chain order later, and its refund request is refused by this same clock.
// A read-only mutation rather than a query, so the result (and `now`) is
// never served from a query cache.
export const linksForReferences = internalMutation({
  args: {
    refs: v.array(v.object({ authority: v.string(), reference: v.string() })),
  },
  handler: async (ctx, { refs }) => {
    if (refs.length > 50)
      throw new ConvexError("At most 50 references per request.");
    const now = Date.now();
    const links: Record<
      string,
      { id: Id<"paymentLinks">; refundPending: boolean }
    > = {};
    for (const { authority, reference } of refs) {
      const link = await ctx.db
        .query("paymentLinks")
        .withIndex("by_reference", (q) =>
          q.eq("merchant", authority).eq("reference", reference),
        )
        .unique();
      if (link)
        links[`${authority}:${reference}`] = {
          id: link._id,
          refundPending: link.refundPending === true,
        };
    }
    return { now, links };
  },
});
// A small set by design; capped so a neglected queue cannot stall a run.
export const openDisputes = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_refund_expiry", (q) => q.eq("refundPending", true))
      .take(200),
});
