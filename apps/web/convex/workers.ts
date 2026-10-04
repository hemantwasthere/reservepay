import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { workerName, workerIssue } from "./workerValidators";

// One bounded record per worker. Only backend actions can write it. Public
// status contains timestamps and fixed codes, never keys, RPC URLs or orders.
export const start = internalMutation({
  args: { name: workerName },
  handler: async (ctx, { name }) => {
    const row = await ctx.db
      .query("workerHealth")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    const generation = (row?.generation ?? 0) + 1;
    const fields = {
      name,
      generation,
      startedAt: Date.now(),
      finishedAt: undefined,
      issue: null,
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("workerHealth", fields);
    return generation;
  },
});

export const finish = internalMutation({
  args: { name: workerName, generation: v.number(), issue: workerIssue },
  handler: async (ctx, { name, generation, issue }) => {
    const row = await ctx.db
      .query("workerHealth")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    // A slow older run must not overwrite the outcome of a newer run.
    if (!row || row.generation !== generation) return;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      finishedAt: now,
      issue,
      ...(issue === null ? { lastSuccessAt: now } : {}),
    });
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    return await Promise.all(
      (["reconcile", "keeper"] as const).map(async (name) => {
        const row = await ctx.db
          .query("workerHealth")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique();
        return {
          name,
          startedAt: row?.startedAt ?? null,
          finishedAt: row?.finishedAt ?? null,
          lastSuccessAt: row?.lastSuccessAt ?? null,
          issue: row?.issue ?? null,
        };
      }),
    );
  },
});
