import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  termsFields,
  receiptFields,
  refundRequestFields,
} from "./paymentValidators";

export default defineSchema({
  paymentLinks: defineTable({
    ...termsFields,
    receipt: v.optional(v.object(receiptFields)),
    refundRequest: v.optional(v.object(refundRequestFields)),
    refundPending: v.optional(v.boolean()),
  })
    .index("by_refund", ["refundPending"])
    .index("by_merchant", ["merchant"])
    .index("by_reference", ["merchant", "reference"]),
  usedNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expires", ["expiresAt"]),
  // Legacy: the earlier stored-nonce design. Kept optional so existing rows
  // still validate on deploy; auth.cleanup drains it. Remove once empty.
  authNonces: defineTable({
    wallet: v.optional(v.string()),
    requester: v.optional(v.string()),
    nonce: v.optional(v.string()),
    issuedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    used: v.optional(v.boolean()),
  }),
  sessions: defineTable({
    wallet: v.string(),
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_wallet", ["wallet"])
    .index("by_expires", ["expiresAt"]),
  merchants: defineTable({
    wallet: v.string(),
    displayName: v.string(),
    imageId: v.optional(v.id("_storage")),
    website: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_wallet", ["wallet"]),
  demoOrders: defineTable({
    sessionKey: v.string(),
    requestId: v.string(),
    amount: v.int64(),
    merchantAmount: v.int64(),
    reserveAmount: v.int64(),
    reserveBps: v.number(),
    status: v.union(
      v.literal("paid"),
      v.literal("completed"),
      v.literal("refunded"),
    ),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionKey"])
    .index("by_request", ["sessionKey", "requestId"]),
});
