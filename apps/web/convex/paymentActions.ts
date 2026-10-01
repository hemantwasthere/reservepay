"use node";
import { ConvexError, v } from "convex/values";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { termsFields } from "./paymentValidators";
import { paymentApproval } from "../src/payments/terms";
import { paymentClient } from "../src/payments/chain";
import { merchantClient } from "../src/merchant/client";
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
