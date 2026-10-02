"use node";
import { ConvexError, v } from "convex/values";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  allowedDomain,
  signInMessage,
  validateWallet,
} from "../src/lib/sign-in";
import { issueNonce, signInSecret, verifyNonce } from "./signInNonce";
import { hashToken } from "./session";

const asConvexError = (error: unknown, fallback: string) =>
  error instanceof ConvexError
    ? error
    : new ConvexError(error instanceof Error ? error.message : fallback);

// Writes nothing, so it needs no rate limit and cannot lock anyone out.
export const requestNonce = action({
  args: { wallet: v.string() },
  handler: async (
    _ctx,
    { wallet },
  ): Promise<{ nonce: string; issuedAt: number; expiresAt: number }> => {
    try {
      validateWallet(wallet);
      return await issueNonce(signInSecret(), wallet);
    } catch (error) {
      throw asConvexError(error, "Could not start sign-in.");
    }
  },
});

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
      await verifyNonce(signInSecret(), challenge);
      if (
        !nacl.sign.detached.verify(
          message,
          bs58.decode(challenge.signature),
          new PublicKey(challenge.wallet).toBytes(),
        )
      )
        throw new Error("The wallet did not approve this sign-in.");
      // Generated here rather than in the mutation, where randomness is seeded.
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const { expiresAt } = await ctx.runMutation(internal.auth.createSession, {
        wallet: challenge.wallet,
        nonce: challenge.nonce,
        nonceExpiresAt: challenge.expiresAt,
        tokenHash: await hashToken(token),
      });
      // The raw token is returned once and never stored.
      return { token, expiresAt };
    } catch (error) {
      throw asConvexError(error, "Could not sign you in.");
    }
  },
});
