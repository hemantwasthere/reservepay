"use node";
import { ConvexError, v } from "convex/values";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { signInMessage } from "../src/lib/sign-in";

const allowedDomain = (domain: string): boolean => {
  const configured = process.env.SITE_ORIGIN?.replace(/^https?:\/\//, "");
  if (configured) return domain === configured;
  if (domain === "reservepayyy.vercel.app") return true;
  // Local development servers.
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(domain);
};

export const signIn = action({
  args: {
    wallet: v.string(),
    nonce: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    domain: v.string(),
    signature: v.string(),
  },
  handler: async (
    ctx,
    challenge,
  ): Promise<{ token: string; expiresAt: number }> => {
    try {
      if (!allowedDomain(challenge.domain))
        throw new Error("This sign-in request comes from another site.");
      const message = signInMessage(challenge);
      if (challenge.signature.length > 88)
        throw new Error("Invalid sign-in signature.");
      if (
        !nacl.sign.detached.verify(
          message,
          bs58.decode(challenge.signature),
          new PublicKey(challenge.wallet).toBytes(),
        )
      )
        throw new Error("The wallet did not approve this sign-in.");
      return await ctx.runMutation(internal.auth.consumeNonce, {
        wallet: challenge.wallet,
        nonce: challenge.nonce,
      });
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        error instanceof Error ? error.message : "Could not sign you in.",
      );
    }
  },
});
