import type { MutationCtx } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel";

export const SWEEP_BATCH = 500;

// Shared expiry sweep for the cleanup crons: deletes up to SWEEP_BATCH rows
// whose indexed timestamp is older than `cutoff`, oldest first. The caller
// reschedules itself when the batch was full, until the backlog is drained.
// `index`/`field` are per-call-site constants that the generic db types
// cannot express against a union of tables, hence the casts.
export async function sweepExpired(
  ctx: MutationCtx,
  opts: { table: TableNames; index: string; field: string; cutoff: number },
): Promise<number> {
  const stale = await ctx.db
    .query(opts.table)
    .withIndex(opts.index as never, (q) =>
      q.lt(opts.field as never, opts.cutoff as never),
    )
    .take(SWEEP_BATCH);
  for (const row of stale) await ctx.db.delete(row._id);
  return stale.length;
}
