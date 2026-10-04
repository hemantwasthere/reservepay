import { ConvexError, v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const CLEANUP_BATCH = 500;
const RETENTION_MS = 10 * 60_000;

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
    if (!row || row.windowStart + windowMs <= now) {
      if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (row.count >= limit)
      return { allowed: false, retryAfterMs: row.windowStart + windowMs - now };
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { allowed: true, retryAfterMs: 0 };
  },
});

export async function enforce(
  ctx: ActionCtx,
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const { allowed, retryAfterMs } = await ctx.runMutation(
    internal.rateLimit.hit,
    { key: `${scope}:${subject}`, limit, windowMs },
  );
  if (!allowed)
    throw new ConvexError(
      `Too many requests. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
}

// Cron entry point. Buckets are only read within their window, so rows
// untouched for ten minutes are dead weight. Deletes in bounded, indexed
// batches and reschedules itself until the backlog is drained.
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("by_window", (q) =>
        q.lt("windowStart", Date.now() - RETENTION_MS),
      )
      .take(CLEANUP_BATCH);
    for (const row of stale) await ctx.db.delete(row._id);
    if (stale.length === CLEANUP_BATCH)
      await ctx.scheduler.runAfter(0, internal.rateLimit.cleanup, {});
    return stale.length;
  },
});
