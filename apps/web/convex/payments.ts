import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { validateTerms } from "../src/payments/terms";
import { RELEASE_GRACE_MS } from "../src/payments/keeper";
import { notifyOrder } from "./notificationEvents";
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
// Link terms and receipts stay public through get/refundQueue. Link history
// requires a wallet session: the unauthenticated list({ merchant }) and the
// non-paginated listForSession were removed (frontends older than 998951b
// lose link history).
export const listForSessionPaginated = query({
  args: { session: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { session, paginationOpts }) => {
    const merchant = await requireMerchant(ctx, session);
    return ctx.db
      .query("paymentLinks")
      .withIndex("by_merchant", (q) => q.eq("merchant", merchant))
      .order("desc")
      .paginate(paginationOpts);
  },
});
// Titles for the protected-orders view: resolves any of this merchant's
// references, however old, instead of only the most recent page. The id and
// dispute state power the Release action; link ids are already public
// through /pay/:id.
export const titlesForReferences = query({
  args: { session: v.string(), references: v.array(v.string()) },
  handler: async (ctx, { session, references }) => {
    const merchant = await requireMerchant(ctx, session);
    if (references.length > 100)
      throw new ConvexError("At most 100 references per request.");
    const titles: Record<
      string,
      {
        title: string;
        description?: string;
        id: string;
        refundPending: boolean;
      }
    > = {};
    for (const reference of new Set(references)) {
      if (!/^[a-f0-9]{32}$/.test(reference))
        throw new ConvexError("Invalid payment reference.");
      const link = await ctx.db
        .query("paymentLinks")
        .withIndex("by_reference", (q) =>
          q.eq("merchant", merchant).eq("reference", reference),
        )
        .unique();
      if (link)
        titles[reference] = {
          title: link.title,
          ...(link.description ? { description: link.description } : {}),
          id: link._id,
          refundPending: link.refundPending === true,
        };
    }
    return titles;
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
      // Compare every signed field, not just the keys present in this
      // request: a hand-crafted retry that omits a field (e.g. the
      // description) must not silently match a link that has one.
      if (
        (Object.keys(termsFields) as (keyof typeof terms)[]).some(
          (key) => (previous[key] ?? undefined) !== (terms[key] ?? undefined),
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
  ctx: QueryCtx | MutationCtx,
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
// Lets paymentActions.deactivate authorize before it touches the RPC.
export const ownedUnpaidLinkForSession = internalQuery({
  args: { session: v.string(), id: v.id("paymentLinks") },
  handler: (ctx, { session, id }) => ownedUnpaidLink(ctx, session, id),
});
// Internal: callers must check the chain first (see paymentActions.deactivate)
// so a link paid seconds ago is never reported inactive.
export const deactivate = internalMutation({
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
    // A dispute counts as new only while both the stored and the incoming
    // receipt are still "paid" — a lagging "paid, disputed" read after a
    // refund or completion must not re-open (or re-queue) the order.
    const stored = link.receipt;
    const newlyDisputed =
      receipt.disputed === true &&
      receipt.status === "paid" &&
      (!stored || stored.status === "paid") &&
      !stored?.disputed;
    if (
      stored &&
      (stored.status !== "paid" || stored.status === receipt.status) &&
      !newlyDisputed
    )
      return stored;
    await ctx.db.patch(id, {
      receipt,
      ...(receipt.status !== "paid"
        ? {
            refundPending: false,
            // Only a link with an actual request gets an outcome; anyone can
            // complete an expired order without one.
            ...(link.refundRequest
              ? { refundOutcome: receipt.status, refundResolvedAt: Date.now() }
              : {}),
          }
        : // A dispute raised directly on-chain (no UI request) still enters
          // the resolver queue, with no reason attached.
          newlyDisputed && !link.refundRequest
          ? {
              refundRequest: {
                reason: "unspecified" as const,
                requestedAt: Date.now(),
              },
              refundPending: true,
            }
          : {}),
    });
    if (receipt.status !== "paid")
      await notifyOrder(ctx, { ...link, receipt }, receipt.status, [
        link.merchant,
        receipt.buyer,
        link.refundNotifiedResolver,
      ]);
    else if (newlyDisputed)
      await notifyOrder(ctx, { ...link, receipt }, "refund_requested", [
        link.merchant,
        receipt.buyer,
      ]);
    return receipt;
  },
});

// The queue contains public categories only, never customer contact details or evidence.
// Ordered by protection deadline, soonest first.
export const refundQueue = query({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_refund_expiry", (q) => q.eq("refundPending", true))
      .take(50),
});
export const refundQueuePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("paymentLinks")
      .withIndex("by_refund_expiry", (q) => q.eq("refundPending", true))
      .paginate(paginationOpts),
});
export const requestRefund = internalMutation({
  args: {
    id: v.id("paymentLinks"),
    receipt: v.object(receiptFields),
    reason: refundReason,
    // Dispute state as decided by the action: the stored receipt's flag, the
    // finalized receipt, or — when it can change the outcome — a confirmed
    // read (finalized can lag a just-confirmed dispute by ~13s).
    disputed: v.optional(v.boolean()),
    // The action's clock, so a request made before expiry is not refused by
    // a mutation that runs after it.
    checkedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, receipt, reason, disputed, checkedAt }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new ConvexError("Payment link not found.");
    const existing = link.refundRequest;
    if (existing) {
      if (existing.reason === reason) return;
      // A chain-side dispute backfills "unspecified"; the buyer's own signed
      // reason may still replace it, keeping the original request time.
      if (existing.reason !== "unspecified")
        throw new ConvexError(
          "A refund has already been requested for this order.",
        );
    }
    if (
      receipt.status !== "paid" ||
      (link.receipt && link.receipt.status !== "paid")
    )
      throw new ConvexError("This order is already resolved.");
    // The chain enforced the dispute window at dispute time, so a disputed
    // order — flagged by any source, including the stored receipt — is
    // accepted even when this request lands after expiry. The deadline is
    // compared against the action's clock, not this mutation's.
    const isDisputed =
      receipt.disputed === true ||
      disputed === true ||
      link.receipt?.disputed === true;
    // checkedAt keeps a request made just before expiry from being refused
    // by a mutation that lands just after it. But checkedAt is taken before
    // the chain reads, which can stall, so this mutation's own clock also
    // enforces the keeper's guarantee: once wall time is RELEASE_GRACE_MS
    // past expiry, no undisputed request may appear — the order may already
    // have been released to the merchant.
    if (
      !isDisputed &&
      (receipt.expiresAt <= (checkedAt ?? Date.now()) ||
        receipt.expiresAt + RELEASE_GRACE_MS <= Date.now())
    )
      throw new ConvexError("The protection period has ended.");
    // Disputed never regresses, so keep the flag if any source has it: the
    // action's confirmed read, this finalized receipt, or the stored one
    // (record() may already hold it from a fresher RPC). Storing a lagging
    // finalized receipt verbatim would otherwise clear it.
    const stored = {
      ...receipt,
      ...(isDisputed ? { disputed: true } : {}),
    };
    await ctx.db.patch(id, {
      receipt: stored,
      refundRequest: {
        reason,
        requestedAt: existing?.requestedAt ?? Date.now(),
      },
      refundPending: true,
    });
    await notifyOrder(ctx, { ...link, receipt: stored }, "refund_requested", [
      link.merchant,
      receipt.buyer,
    ]);
  },
});
