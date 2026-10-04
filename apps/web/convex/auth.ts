import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { findSession, hashToken } from "./session";
import { SWEEP_BATCH, sweepExpired } from "./cleanup";

const SESSION_TTL = 7 * 24 * 60 * 60_000;

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
    // Re-check expiry inside the transaction: the action verified the nonce
    // earlier, and cleanup may have deleted its usedNonces row since
    // (expiresAt <= now), which would otherwise let a replay through.
    if (nonceExpiresAt <= Date.now())
      throw new ConvexError("This sign-in link expired. Try again.");
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
    const nonces = await sweepExpired(ctx, {
      table: "usedNonces",
      index: "by_expires",
      field: "expiresAt",
      cutoff: now,
      // Expired means expiresAt <= now, as before the shared sweep.
      inclusive: true,
    });
    const sessions = await sweepExpired(ctx, {
      table: "sessions",
      index: "by_expires",
      field: "expiresAt",
      cutoff: now,
      // Expired means expiresAt <= now, as before the shared sweep.
      inclusive: true,
    });
    // Rows from the earlier stored-nonce design are no longer read.
    const legacy = await ctx.db.query("authNonces").take(SWEEP_BATCH);
    for (const row of legacy) await ctx.db.delete(row._id);
    if ([nonces, sessions, legacy.length].some((count) => count === SWEEP_BATCH))
      await ctx.scheduler.runAfter(0, internal.auth.cleanup, {});
    return nonces + sessions + legacy.length;
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
