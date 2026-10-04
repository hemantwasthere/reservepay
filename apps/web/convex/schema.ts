import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  termsFields,
  receiptFields,
  refundRequestFields,
} from "./paymentValidators";

import { notificationKind } from "./notificationEvents";
import { workerName, workerIssue } from "./workerValidators";

export default defineSchema({
  notifications: defineTable({
    wallet: v.string(),
    linkId: v.id("paymentLinks"),
    kind: notificationKind,
    title: v.string(),
    expiresAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_wallet", ["wallet"])
    .index("by_unread", ["wallet", "readAt"])
    .index("by_event", ["wallet", "linkId", "kind"]),
  workerHealth: defineTable({
    name: workerName,
    generation: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    issue: workerIssue,
  }).index("by_name", ["name"]),
  paymentLinks: defineTable({
    ...termsFields,
    receipt: v.optional(v.object(receiptFields)),
    refundRequest: v.optional(v.object(refundRequestFields)),
    refundPending: v.optional(v.boolean()),
    refundNotifiedResolver: v.optional(v.string()),
    // Recorded when a requested refund resolves, so dispute history can be
    // built without a backfill. "completed" means the reserve was released
    // (by the resolver or by anyone after expiry), not that it was rejected.
    refundOutcome: v.optional(
      v.union(v.literal("refunded"), v.literal("completed")),
    ),
    refundResolvedAt: v.optional(v.number()),
    // Not part of the signed terms; the merchant can toggle it any time.
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_refund", ["refundPending"])
    .index("by_refund_expiry", ["refundPending", "receipt.expiresAt"])
    .index("by_merchant", ["merchant"])
    .index("by_reference", ["merchant", "reference"])
    // Maps a chain order to its links with no merchant RPC (reconciler).
    .index("by_reference_only", ["reference"])
    // "paid" pages and — via eq(undefined), which matches a missing receipt —
    // the never-synced sweep.
    .index("by_receipt_status", ["receipt.status"])
    .index("by_paid_expiry", ["receipt.status", "receipt.expiresAt"]),
  // Reconciler pagination cursors, so a run that stops mid-sweep resumes
  // where it left off instead of skipping or restarting.
  syncState: defineTable({
    name: v.string(),
    cursor: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),
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
