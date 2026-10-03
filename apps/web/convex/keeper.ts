import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Link lookup for the keeper, keyed "authority:reference" to match
// selectReleasable. At most 50 references per call.
export const linksForReferences = internalQuery({
  args: {
    refs: v.array(v.object({ authority: v.string(), reference: v.string() })),
  },
  handler: async (ctx, { refs }) => {
    if (refs.length > 50)
      throw new ConvexError("At most 50 references per request.");
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
    return links;
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
