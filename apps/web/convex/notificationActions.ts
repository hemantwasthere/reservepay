"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { paymentClient } from "../src/payments/chain";
import { withRetry } from "../src/lib/retry";
import { serverRpc } from "./rpc";
import { trackWorker } from "./trackWorker";

type Summary = {
  created: number;
  scanned: number;
  resolverUnavailable: boolean;
  restarted: boolean;
};
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<Summary> =>
    trackWorker(ctx, "notifications", async () => {
      let resolver: string | undefined;
      try {
        resolver = (
          await withRetry(() =>
            paymentClient(serverRpc("finalized")).readResolver(),
          )
        ).toBase58();
      } catch {
        // Merchant/buyer reminders keep working during an RPC outage. Never
        // accept the resolver from a browser or log credential-bearing errors.
      }
      const disputes = await ctx.runMutation(internal.notifications.sweep, {
        kind: "disputes",
        resolver,
      });
      const deadlines = await ctx.runMutation(internal.notifications.sweep, {
        kind: "deadlines",
        resolver,
      });
      const result = {
        created: disputes.created + deadlines.created,
        scanned: disputes.scanned + deadlines.scanned,
        resolverUnavailable: !resolver,
        restarted: disputes.restarted || deadlines.restarted,
      };
      return {
        result,
        issue: !resolver ? "failed" : result.restarted ? "incomplete" : null,
      };
    }),
});
