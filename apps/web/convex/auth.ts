import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { findSession, hashToken } from "./session";

const SESSION_TTL = 7 * 24 * 60 * 60_000;
const CLEANUP_BATCH = 500;

// Runs only after the sign-in action verified the nonce's HMAC and the wallet
// signature, so anonymous callers can never reach these writes.
export const createSession = internalMutation({
  args: {
    wallet: v.string(),
    nonce: v.string(),
    nonceExpiresAt: v.number(),
    tokenHash: v.string(),
  },
  handler: async (ctx, { wallet, nonce, nonceExpiresAt, tokenHash }) => {
    const used = await ctx.db
      .query("usedNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (used) throw new ConvexError("This sign-in link expired. Try again.");
    await ctx.db.insert("usedNonces", { nonce, expiresAt: nonceExpiresAt });
    const createdAt = Date.now();
    const expiresAt = createdAt + SESSION_TTL;
    await ctx.db.insert("sessions", { wallet, tokenHash, createdAt, expiresAt });
    return { expiresAt };
  },
});

// Cron entry point. Deletes expired nonce records and sessions in bounded,
// indexed batches, and reschedules itself until the backlog is drained.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const nonces = await ctx.db
      .query("usedNonces")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(CLEANUP_BATCH);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_expires", (q) => q.lte("expiresAt", now))
      .take(CLEANUP_BATCH);
    // Rows from the earlier stored-nonce design are no longer read.
    const legacy = await ctx.db.query("authNonces").take(CLEANUP_BATCH);
    for (const row of [...nonces, ...sessions, ...legacy])
      await ctx.db.delete(row._id);
    if (
      [nonces, sessions, legacy].some((batch) => batch.length === CLEANUP_BATCH)
    )
      await ctx.scheduler.runAfter(0, internal.auth.cleanup, {});
    return nonces.length + sessions.length + legacy.length;
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
