import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

type Issue = "unconfigured" | "failed" | "incomplete" | "low_funds" | null;

export async function trackWorker<T>(
  ctx: ActionCtx,
  name: "keeper" | "reconcile" | "notifications",
  work: () => Promise<{ result: T; issue: Issue }>,
): Promise<T> {
  const generation: number = await ctx.runMutation(internal.workers.start, {
    name,
  });
  try {
    const { result, issue } = await work();
    await ctx.runMutation(internal.workers.finish, { name, generation, issue });
    return result;
  } catch {
    await ctx.runMutation(internal.workers.finish, {
      name,
      generation,
      issue: "failed",
    });
    // RPC exceptions can contain credentials. Preserve failure semantics with
    // a fixed error, while the persisted heartbeat also detects hard timeouts.
    throw new Error(
      `${name}: background run failed; retrying next scheduled run.`,
    );
  }
}
