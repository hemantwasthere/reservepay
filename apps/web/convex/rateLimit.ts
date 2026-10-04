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
export const hit = internalMutation({
  args: { key: v.string(), limit: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, limit, windowMs }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row || row.expiresAt <= now) {
      const window = { windowStart: now, expiresAt: now + windowMs, count: 1 };
      if (row) await ctx.db.patch(row._id, window);
      else await ctx.db.insert("rateLimits", { key, ...window });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (row.count >= limit)
      return { allowed: false, retryAfterMs: row.expiresAt - now };
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { allowed: true, retryAfterMs: 0 };
  },
});

// Returns a hit to the bucket, e.g. when the work it guarded failed and the
// next caller should retry instead of waiting out the window. Only the
// current window can be released; an expired row is dead anyway.
export const unhit = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row || row.expiresAt <= Date.now()) return;
    if (row.count <= 1) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, { count: row.count - 1 });
  },
});

export async function allow(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
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
): Promise<void> {
  await ctx.runMutation(internal.rateLimit.unhit, { key: key(scope, subject) });
}

export async function enforce(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const { allowed, retryAfterMs } = await allow(
    ctx,
    scope,
    subject,
    limit,
    windowMs,
  );
  if (!allowed)
    throw new ConvexError(
      `Too many requests. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
}

// Cron entry point. Rows are only read while their window is live, so rows
// expired for more than ten minutes are dead weight. Deletes in bounded,
// indexed batches and reschedules itself until the backlog is drained.
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
