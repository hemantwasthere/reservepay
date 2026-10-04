import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { RELEASE_GRACE_MS, RELEASE_MARGIN_MS } from "../src/payments/keeper";

// Link lookup for the keeper, keyed "authority:reference" to match
// selectReleasable. At most 50 references per call.
export const linksForReferences = internalQuery({
  args: {
    refs: v.array(
      v.object({
        authority: v.string(),
        reference: v.string(),
        expiresAt: v.number(), // seconds, from the on-chain order
      }),
    ),
  },
  handler: async (ctx, { refs }) => {
    // The release cutoff is decided here, on the Convex backend clock — the
    // same clock payments.requestRefund uses to refuse late requests — not on
    // the keeper's Node runtime clock, which nothing keeps in sync with it.
    // The margin then only has to cover a request mutation's run time.
    const now = Date.now();
    if (refs.length > 50)
      throw new ConvexError("At most 50 references per request.");
    const links: Record<
      string,
      { id: Id<"paymentLinks">; refundPending: boolean; settled: boolean }
    > = {};
    for (const { authority, reference, expiresAt } of refs) {
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
          settled:
            now >= expiresAt * 1000 + RELEASE_GRACE_MS + RELEASE_MARGIN_MS,
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
