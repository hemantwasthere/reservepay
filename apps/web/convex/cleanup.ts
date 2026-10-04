import type { IndexNames, NamedIndex, NamedTableInfo } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { DataModel, TableNames } from "./_generated/dataModel";

export const SWEEP_BATCH = 500;

type TableInfo<T extends TableNames> = NamedTableInfo<DataModel, T>;

// Shared expiry sweep for the cleanup crons: deletes up to SWEEP_BATCH rows
// whose indexed timestamp is older than `cutoff`, oldest first. The caller
// reschedules itself when the batch was full, until the backlog is drained.
// The signature ties `index` to `table` and `field` to that index's first
// column, so a wrong name fails typecheck instead of the cron. TypeScript
// cannot resolve the query builder's types for a generic table inside the
// body, hence the casts there only.
export async function sweepExpired<
  T extends TableNames,
  I extends IndexNames<TableInfo<T>>,
>(
  ctx: MutationCtx,
  opts: {
    table: T;
    index: I;
    field: NamedIndex<TableInfo<T>, I>[0];
    cutoff: number;
  },
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
