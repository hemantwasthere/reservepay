import { ConvexError, v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { validateTerms } from "../src/payments/terms";

import { termsFields, receiptFields } from "./paymentValidators";

// Link descriptions and on-chain receipts are public. Never put customer data here.
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const key = ctx.db.normalizeId("paymentLinks", id);
    return key ? ctx.db.get(key) : null;
  },
});
export const list = query({
  args: { merchant: v.string() },
  handler: (ctx, { merchant }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_merchant", (q) => q.eq("merchant", merchant))
      .order("desc")
      .take(50),
});
export const findReference = internalQuery({
  args: { merchant: v.string(), reference: v.string() },
  handler: (ctx, { merchant, reference }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_reference", (q) =>
        q.eq("merchant", merchant).eq("reference", reference),
      )
      .unique(),
});
export const insert = internalMutation({
  args: termsFields,
  handler: async (ctx, terms) => {
    validateTerms(terms);
    const previous = await ctx.db
      .query("paymentLinks")
      .withIndex("by_reference", (q) =>
        q.eq("merchant", terms.merchant).eq("reference", terms.reference),
      )
      .unique();
    if (previous) {
      if (
        Object.keys(terms).some(
          (key) =>
            previous[key as keyof typeof terms] !==
            terms[key as keyof typeof terms],
        )
      )
        throw new ConvexError(
          "This reference is already used by another link.",
        );
      return previous._id;
    }
    const recent = await ctx.db
      .query("paymentLinks")
      .withIndex("by_merchant", (q) =>
        q
          .eq("merchant", terms.merchant)
          .gte("_creationTime", Date.now() - 60_000),
      )
      .take(10);
    if (recent.length >= 10)
      throw new ConvexError("Please wait a minute before creating more links.");
    return ctx.db.insert("paymentLinks", terms);
  },
});
export const record = internalMutation({
  args: { id: v.id("paymentLinks"), receipt: v.object(receiptFields) },
  handler: async (ctx, { id, receipt }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new ConvexError("Payment link not found.");
    // A slower RPC response must never roll a resolved receipt back to paid.
    if (
      link.receipt &&
      (link.receipt.status !== "paid" || link.receipt.status === receipt.status)
    )
      return link.receipt;
    await ctx.db.patch(id, { receipt });
    return receipt;
  },
});
