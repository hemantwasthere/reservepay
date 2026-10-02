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
