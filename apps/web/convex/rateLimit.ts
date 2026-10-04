import { ConvexError, v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { SWEEP_BATCH, sweepExpired } from "./cleanup";

const RETENTION_MS = 10 * 60_000;

export const key = (scope: string, subject: string) => `${scope}:${subject}`;

// Fixed-window counter. Mutations are OCC-serializable, so read-then-write is
// exact under concurrency. A bucket may only be consumed by the party it
// protects: callers enforce after the cheap proof that the caller is
// legitimate, never keyed on raw unvalidated input.
// Every result carries the window's expiresAt so a later release can prove
// it is returning a hit to the same window it took it from.
export const hit = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, limit, windowMs }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    // Rows written before expiresAt existed count as expired; the reset also
    // unsets the legacy windowStart so reused rows converge to the new shape.
    if (!row || row.expiresAt === undefined || row.expiresAt <= now) {
      const window = { expiresAt: now + windowMs, count: 1 };
      if (row)
        await ctx.db.patch(row._id, { ...window, windowStart: undefined });
      else await ctx.db.insert("rateLimits", { key, ...window });
      return { allowed: true, retryAfterMs: 0, expiresAt: window.expiresAt };
    }
    if (row.count >= limit)
      return {
        allowed: false,
        retryAfterMs: row.expiresAt - now,
        expiresAt: row.expiresAt,
      };
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { allowed: true, retryAfterMs: 0, expiresAt: row.expiresAt };
  },
});

// Returns a hit to the bucket when the work it guarded failed transiently, so
// the next caller retries instead of waiting out the window. Bound to the
// window the hit came from: if that window has expired or rolled over, the
// row now belongs to someone else's claim and is left alone.
export const unhit = internalMutation({
  args: { key: v.string(), expiresAt: v.number() },
  handler: async (ctx, { key, expiresAt }) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row || row.expiresAt !== expiresAt || expiresAt <= Date.now()) return;
    if (row.count <= 1) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, { count: row.count - 1 });
  },
});

export type Claim = { allowed: boolean; retryAfterMs: number; expiresAt: number };

export async function allow(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<Claim> {
  return ctx.runMutation(internal.rateLimit.hit, {
    key: key(scope, subject),
    limit,
    windowMs,
  });
}

export async function release(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  claim: Claim,
): Promise<void> {
  // A denied claim borrowed nothing; decrementing would free a hit from the
  // live window it merely observed.
  if (!claim.allowed) return;
  await ctx.runMutation(internal.rateLimit.unhit, {
    key: key(scope, subject),
    expiresAt: claim.expiresAt,
  });
}

// Throws when the bucket is full; otherwise returns the claim so the caller
// can release it if the guarded work fails transiently.
export async function enforce(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<Claim> {
  const claim = await allow(ctx, scope, subject, limit, windowMs);
  if (!claim.allowed)
    throw new ConvexError(
      `Too many requests. Try again in ${Math.ceil(claim.retryAfterMs / 1000)} seconds.`,
    );
  return claim;
}

// Cron entry point. Rows are only read while their window is live, so rows
// expired for more than ten minutes are dead weight. Deletes in bounded,
// indexed batches and reschedules itself until the backlog is drained.
// Rows from the earlier build have no expiresAt; a missing field indexes as
// undefined, which sorts before every number, so this same lt() range
// sweeps them too.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await sweepExpired(ctx, {
      table: "rateLimits",
      index: "by_expires_at",
      field: "expiresAt",
      cutoff: Date.now() - RETENTION_MS,
    });
    if (deleted === SWEEP_BATCH)
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanup, {});
    return deleted;
  },
});
