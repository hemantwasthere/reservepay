import { v } from "convex/values";
export const termsFields = {
  merchant: v.string(),
  reference: v.string(),
  title: v.string(),
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
};
