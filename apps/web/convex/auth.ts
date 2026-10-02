import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { validateWallet } from "../src/lib/sign-in";
import { findSession, hashToken } from "./session";

const NONCE_TTL = 5 * 60_000;
const SESSION_TTL = 7 * 24 * 60 * 60_000;

const randomHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const requestNonce = mutation({
  args: { wallet: v.string() },
  handler: async (ctx, { wallet }) => {
    validateWallet(wallet);
    // No per-wallet rate limit here: the requester is anonymous, so a limit
    // keyed on the target wallet would let anyone lock a merchant out of
    // sign-in. Nonces are single-use and expire after 5 minutes.
    const issuedAt = Date.now();
    const expiresAt = issuedAt + NONCE_TTL;
    const nonce = randomHex(16);
    await ctx.db.insert("authNonces", {
      wallet,
      nonce,
      issuedAt,
      expiresAt,
      used: false,
    });
    return { nonce, issuedAt, expiresAt };
  },
});

export const consumeNonce = internalMutation({
  args: { wallet: v.string(), nonce: v.string() },
  handler: async (ctx, { wallet, nonce }) => {
    const row = await ctx.db
      .query("authNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .unique();
    if (!row || row.used || row.wallet !== wallet || row.expiresAt <= Date.now())
      throw new ConvexError("This sign-in link expired. Try again.");
    await ctx.db.patch(row._id, { used: true });
    const token = randomHex(32);
    const createdAt = Date.now();
    const expiresAt = createdAt + SESSION_TTL;
    await ctx.db.insert("sessions", {
      wallet,
      tokenHash: await hashToken(token),
      createdAt,
      expiresAt,
    });
    // The raw token is returned once and never stored.
    return { token, expiresAt };
  },
});

export const me = query({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const row = await findSession(ctx, session);
    return row ? { wallet: row.wallet, expiresAt: row.expiresAt } : null;
  },
});

export const signOut = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    if (!/^[a-f0-9]{64}$/.test(session)) return;
    const tokenHash = await hashToken(session);
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
