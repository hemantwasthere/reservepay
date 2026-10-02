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
    // The requester is anonymous, so a per-wallet limit would let anyone lock
    // a merchant out of sign-in. A global cap bounds table growth instead;
    // the cleanup cron below keeps this scan small.
    const recent = await ctx.db.query("authNonces").order("desc").take(60);
    if (
      recent.length >= 60 &&
      recent[recent.length - 1]._creationTime > Date.now() - 60_000
    )
      throw new ConvexError("Sign-in is busy. Try again in a minute.");
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

// Cron entry point: delete nonces that are used or expired, and sessions that
// expired, so sign-in tables stay bounded.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const staleNonces = await ctx.db
      .query("authNonces")
      .filter((q) =>
        q.or(
          q.eq(q.field("used"), true),
          q.lte(q.field("expiresAt"), Date.now()),
        ),
      )
      .take(250);
    for (const row of staleNonces) await ctx.db.delete(row._id);
    const staleSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.lte(q.field("expiresAt"), Date.now()))
      .take(250);
    for (const row of staleSessions) await ctx.db.delete(row._id);
    return staleNonces.length + staleSessions.length;
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
