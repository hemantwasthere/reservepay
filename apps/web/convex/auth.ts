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

export const requestNonce = internalMutation({
  args: { wallet: v.string(), requester: v.string() },
  handler: async (ctx, { wallet, requester }) => {
    validateWallet(wallet);
    // Limited per requester (the client IP seen by the HTTP endpoint), never
    // per wallet or globally, so no one can lock out a merchant or the site.
    const recent = await ctx.db
      .query("authNonces")
      .withIndex("by_requester", (q) =>
        q.eq("requester", requester).gte("_creationTime", Date.now() - 60_000),
      )
      .take(10);
    if (recent.length >= 10)
      throw new ConvexError("Too many sign-in attempts. Please wait a minute.");
    const issuedAt = Date.now();
    const expiresAt = issuedAt + NONCE_TTL;
    const nonce = randomHex(16);
    await ctx.db.insert("authNonces", {
      wallet,
      requester,
      nonce,
      issuedAt,
      expiresAt,
      used: false,
    });
    return { nonce, issuedAt, expiresAt };
  },
});

// Cron entry point: delete nonces that are used or expired, and sessions that
// expired, so sign-in tables stay bounded. Loops until drained (bounded per
// run) so cleanup keeps up with the request rate.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0;
    for (;;) {
      const batch = await ctx.db
        .query("authNonces")
        .filter((q) =>
          q.or(
            q.eq(q.field("used"), true),
            q.lte(q.field("expiresAt"), Date.now()),
          ),
        )
        .take(250);
      for (const row of batch) await ctx.db.delete(row._id);
      removed += batch.length;
      if (batch.length < 250 || removed >= 5_000) break;
    }
    for (;;) {
      const batch = await ctx.db
        .query("sessions")
        .filter((q) => q.lte(q.field("expiresAt"), Date.now()))
        .take(250);
      for (const row of batch) await ctx.db.delete(row._id);
      removed += batch.length;
      if (batch.length < 250 || removed >= 10_000) break;
    }
    return removed;
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
