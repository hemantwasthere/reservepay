import { v } from "convex/values";
export const termsFields = {
  merchant: v.string(),
  reference: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  amount: v.string(),
  protectionSeconds: v.number(),
  issuedAt: v.number(),
};
export const receiptFields = {
  order: v.string(),
  buyer: v.string(),
  reserveAmount: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  status: v.union(
    v.literal("paid"),
    v.literal("completed"),
    v.literal("refunded"),
  ),
  // Set once the on-chain order is Disputed; additive for old receipts.
  disputed: v.optional(v.boolean()),
};

export const refundReason = v.union(
  v.literal("not_received"),
  v.literal("not_as_described"),
  v.literal("cancellation"),
);
// Stored requests also allow "unspecified": a dispute raised directly on-chain
// (not through the UI) carries no reason. The buyer-facing action keeps the
// strict refundReason above.
export const storedRefundReason = v.union(
  v.literal("not_received"),
  v.literal("not_as_described"),
  v.literal("cancellation"),
  v.literal("unspecified"),
);
export const refundRequestFields = {
  reason: storedRefundReason,
  requestedAt: v.number(),
};
