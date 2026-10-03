import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { validateTerms } from "../src/payments/terms";
import { requireMerchant } from "./session";

import { termsFields, receiptFields, refundReason } from "./paymentValidators";

// Link descriptions and on-chain receipts are public. Never put customer data here.
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const key = ctx.db.normalizeId("paymentLinks", id);
    return key ? ctx.db.get(key) : null;
  },
});
// Compatibility for already-open clients from before wallet sessions. Link
// terms and receipts remain public (also available through get/refundQueue).
// Keep this separate from the authenticated API; never add profile data here.
export const list = query({
  args: { merchant: v.string() },
  handler: (ctx, { merchant }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_merchant", (q) => q.eq("merchant", merchant))
      .order("desc")
      .take(50),
});
export const listForSession = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const merchant = await requireMerchant(ctx, session);
    return ctx.db
      .query("paymentLinks")
      .withIndex("by_merchant", (q) => q.eq("merchant", merchant))
      .order("desc")
      .take(50);
  },
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
// The merchant can stop an unpaid link without touching paid receipts. Other
// merchants' link IDs are never revealed: same "not found" as a missing link.
const ownedUnpaidLink = async (
  ctx: MutationCtx,
  session: string,
  id: Id<"paymentLinks">,
) => {
  const wallet = await requireMerchant(ctx, session);
  const link = await ctx.db.get(id);
  if (!link || link.merchant !== wallet)
    throw new ConvexError("Payment link not found.");
  if (link.receipt) throw new ConvexError("This link has already been paid.");
  return link;
};
export const deactivate = mutation({
  args: { session: v.string(), id: v.id("paymentLinks") },
  handler: async (ctx, { session, id }) => {
    const link = await ownedUnpaidLink(ctx, session, id);
    if (!link.deactivatedAt)
      await ctx.db.patch(id, { deactivatedAt: Date.now() });
  },
});
export const reactivate = mutation({
  args: { session: v.string(), id: v.id("paymentLinks") },
  handler: async (ctx, { session, id }) => {
    const link = await ownedUnpaidLink(ctx, session, id);
    if (link.deactivatedAt)
      await ctx.db.patch(id, { deactivatedAt: undefined });
  },
});
// record stays unchanged: a buyer can still pay a stale tab after
// deactivation, and moved funds must always get their receipt.
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
    await ctx.db.patch(id, {
      receipt,
      ...(receipt.status !== "paid" ? { refundPending: false } : {}),
    });
    return receipt;
  },
});

// The queue contains public categories only, never customer contact details or evidence.
export const refundQueue = query({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_refund", (q) => q.eq("refundPending", true))
      .take(50),
});
export const requestRefund = internalMutation({
  args: {
    id: v.id("paymentLinks"),
    receipt: v.object(receiptFields),
    reason: refundReason,
  },
  handler: async (ctx, { id, receipt, reason }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new ConvexError("Payment link not found.");
    if (link.refundRequest) {
      if (link.refundRequest.reason !== reason)
        throw new ConvexError(
          "A refund has already been requested for this order.",
        );
      return;
    }
    if (
      receipt.status !== "paid" ||
      (link.receipt && link.receipt.status !== "paid")
    )
      throw new ConvexError("This order is already resolved.");
    if (receipt.expiresAt <= Date.now())
      throw new ConvexError("The protection period has ended.");
    await ctx.db.patch(id, {
      receipt,
      refundRequest: { reason, requestedAt: Date.now() },
      refundPending: true,
    });
  },
});
