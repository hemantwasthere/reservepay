"use node";
import { ConvexError, v } from "convex/values";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { termsFields, refundReason } from "./paymentValidators";
import { paymentApproval } from "../src/payments/terms";
import { paymentClient } from "../src/payments/chain";
import { merchantClient } from "../src/merchant/client";
import { refundApproval } from "../src/payments/refunds";
import type { Id } from "./_generated/dataModel";

const rpc = new Connection("https://api.devnet.solana.com", {
  commitment: "finalized",
  disableRetryOnRateLimit: true,
});
export const create = action({
  args: { terms: v.object(termsFields), signature: v.string() },
  handler: async (ctx, { terms, signature }): Promise<Id<"paymentLinks">> => {
    try {
      const message = paymentApproval(terms);
      if (signature.length > 88) throw new Error("Invalid approval signature.");
      const authority = new PublicKey(terms.merchant);
      if (
        !nacl.sign.detached.verify(
          message,
          bs58.decode(signature),
          authority.toBytes(),
        )
      )
        throw new Error("The merchant did not approve these payment details.");
      const previous = await ctx.runQuery(internal.payments.findReference, {
        merchant: terms.merchant,
        reference: terms.reference,
      });
      // Replaying the exact signed request can only return its original link.
      if (
        !previous &&
        (terms.issuedAt < Date.now() - 600_000 ||
          terms.issuedAt > Date.now() + 30_000)
      )
        throw new Error("This approval expired. Create the link again.");
      const merchant = await merchantClient(rpc).read(authority);
      if (!merchant.ready || !merchant.registered)
        throw new Error(
          "Register your merchant account before creating a payment link.",
        );
      return await ctx.runMutation(internal.payments.insert, terms);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        error instanceof Error
          ? error.message
          : "Could not create your payment link.",
      );
    }
  },
});
export const sync = action({
  args: { id: v.string() },
  handler: async (ctx, { id }): Promise<boolean> => {
    const link = await ctx.runQuery(api.payments.get, { id });
    if (!link) throw new Error("Payment link not found.");
    const receipt = await paymentClient(rpc).readOrder(link);
    if (!receipt) return false;
    await ctx.runMutation(internal.payments.record, { id: link._id, receipt });
    return true;
  },
});

export const deactivate = action({
  args: { session: v.string(), id: v.id("paymentLinks") },
  handler: async (ctx, { session, id }): Promise<void> => {
    // Checkout only records a receipt on its next status check, up to 10
    // seconds after payment. Record any on-chain order first so a link the
    // buyer just paid can never be reported inactive.
    const link = await ctx.runQuery(api.payments.get, { id });
    if (link && !link.receipt) {
      const receipt = await paymentClient(rpc).readOrder(link);
      if (receipt)
        await ctx.runMutation(internal.payments.record, {
          id: link._id,
          receipt,
        });
    }
    await ctx.runMutation(internal.payments.deactivate, { session, id });
  },
});

export const requestRefund = action({
  args: {
    id: v.string(),
    order: v.string(),
    buyer: v.string(),
    reason: refundReason,
    issuedAt: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, { signature, ...request }): Promise<void> => {
    try {
      if (
        signature.length > 88 ||
        !nacl.sign.detached.verify(
          refundApproval(request),
          bs58.decode(signature),
          new PublicKey(request.buyer).toBytes(),
        )
      )
        throw new Error("The buyer did not approve this refund request.");
      const link = await ctx.runQuery(api.payments.get, { id: request.id });
      if (!link) throw new Error("Payment link not found.");
      const receipt = await paymentClient(rpc).readOrder(link);
      if (
        !receipt ||
        receipt.buyer !== request.buyer ||
        receipt.order !== request.order
      )
        throw new Error(
          "Only the verified buyer can request a refund for this order.",
        );
      if (
        !link.refundRequest &&
        (request.issuedAt < Date.now() - 600_000 ||
          request.issuedAt > Date.now() + 30_000)
      )
        throw new Error("This approval expired. Request the refund again.");
      await ctx.runMutation(internal.payments.requestRefund, {
        id: link._id,
        receipt,
        reason: request.reason,
      });
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Could not request a refund.",
      );
    }
  },
});
