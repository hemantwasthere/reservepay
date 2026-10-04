"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { PublicKey } from "@solana/web3.js";
import { merchantAddress } from "@reservepay/core";
import { DEVNET_USDC } from "../src/merchant/client";
import { keeperChain } from "../src/payments/keeper-chain";
import { syncLinks, type SyncSummary } from "./syncLink";
import { serverRpc } from "./rpc";
import type { Doc } from "./_generated/dataModel";

const PAGE = 200;
const MAX_RUN_MS = 90_000;

// Keyless reconciliation: receipts are otherwise written only when a client
// calls sync, so a buyer who closes the tab (or an order resolved outside
// the app) would leave the Convex receipt stale. Solana stays the source of
// truth; this cron rebuilds the Convex cache from it every run. Receipts are
// read at finalized and payments.record never regresses a status, so a run
// either writes the correct finalized state or is a no-op.
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const started = Date.now();
    const outOfTime = () => Date.now() - started > MAX_RUN_MS;
    const receipts = serverRpc("finalized");
    const summary = {
      scanned: 0,
      scanFailed: false,
      synced: 0,
      missing: 0,
      mismatched: 0,
      failed: 0,
      skipped: [] as string[],
    };
    const count = (result: SyncSummary) => {
      summary.synced += result.synced;
      summary.missing += result.missing;
      summary.mismatched += result.mismatched;
      summary.failed += result.failed;
    };
    // A step that did not run (or did not finish) is named here — step names
    // only — so a persistently failing sweep or an exhausted time budget
    // shows up in the summary instead of looking like a quiet run.
    const skip = (step: string) => {
      summary.skipped.push(step);
    };
    // Steps 1–3 need the open-order scan: without it every paid link would
    // look "not open" and get mass-synced, so they skip a failed scan. The
    // catch-up sweep (step 4) does not compare against it and always runs.
    let openSet: Set<string> | null = null;
    const syncedInScan = new Set<string>();
    try {
      const openOrders = await keeperChain(serverRpc("confirmed")).openOrders();
      summary.scanned = openOrders.length;
      openSet = new Set(openOrders.map((order) => order.order));
      const candidates: Doc<"paymentLinks">[] = [];
      let complete = true;
      for (let start = 0; start < openOrders.length; start += 100) {
        if (outOfTime()) {
          complete = false;
          break;
        }
        const chunk = openOrders.slice(start, start + 100);
        const byReference = await ctx.runQuery(
          internal.reconcile.linksByReference,
          { references: chunk.map((order) => order.reference) },
        );
        // Anyone can open an order for a link's reference, so reference alone
        // is not enough: the link's merchant must derive the order's PDA.
        for (const order of chunk)
          for (const link of byReference[order.reference] ?? [])
            if (
              merchantAddress(new PublicKey(link.merchant), DEVNET_USDC)
                .toBase58() === order.merchantPda
            )
              candidates.push(link);
      }
      // Orders confirmed but not yet finalized read as Open here; their
      // receipts land on a later run, never a wrong one.
      const unsynced = candidates.filter((link) => !link.receipt);
      if (unsynced.length > 0 && !outOfTime()) {
        for (const link of unsynced) syncedInScan.add(link._id);
        count(await syncLinks(ctx, unsynced, receipts));
      } else if (unsynced.length > 0) {
        complete = false;
      }
      if (!complete) skip("scan");
    } catch {
      openSet = null;
      // Steps 1–3 skip this run; the scanFailed flag in the summary line
      // keeps a persistently rate-limited RPC from looking like a quiet run.
      // The error itself is not logged: RPC messages can embed the URL.
      summary.scanFailed = true;
      skip("scan");
    }
    // Disputes are never paged, so a resolved dispute always clears within
    // one run.
    if (openSet && !outOfTime()) {
      const disputes = await ctx.runQuery(internal.keeper.openDisputes, {});
      const resolved = disputes.filter(
        (link) => link.receipt && !openSet.has(link.receipt.order),
      );
      if (resolved.length > 0) count(await syncLinks(ctx, resolved, receipts));
    } else if (openSet) {
      skip("disputes");
    }
    // A page's cursor is saved only after its reads succeed: a failed chunk
    // retries the same page next run instead of skipping 200 links. An
    // isDone page resets the cursor so the sweep starts over.
    const page = async (
      name: string,
      query:
        | typeof internal.reconcile.paidLinks
        | typeof internal.reconcile.unsyncedLinks,
      select: (links: Doc<"paymentLinks">[]) => Doc<"paymentLinks">[],
    ) => {
      const cursor = await ctx.runQuery(internal.reconcile.getCursor, { name });
      let result;
      try {
        result = await ctx.runQuery(query, {
          paginationOpts: { numItems: PAGE, cursor },
        });
      } catch {
        // A stored cursor that no longer pages must not stall the sweep:
        // drop it and restart from the beginning next run.
        if (cursor !== null)
          await ctx.runMutation(internal.reconcile.setCursor, {
            name,
            cursor: null,
          });
        skip(name);
        return;
      }
      const links = select(result.page);
      const failedBefore = summary.failed;
      if (links.length > 0) count(await syncLinks(ctx, links, receipts));
      if (summary.failed === failedBefore)
        await ctx.runMutation(internal.reconcile.setCursor, {
          name,
          cursor: result.isDone ? null : result.continueCursor,
        });
    };
    if (openSet && !outOfTime())
      await page("paid", internal.reconcile.paidLinks, (links) =>
        links.filter((link) => !openSet.has(link.receipt!.order)),
      );
    else if (openSet) skip("paid");
    if (!outOfTime())
      await page("unsynced", internal.reconcile.unsyncedLinks, (links) =>
        links.filter((link) => !syncedInScan.has(link._id)),
      );
    else skip("unsynced");
    // One summary line per run; never log link documents or env values.
    console.log(`reconcile: ${JSON.stringify(summary)}`);
    return summary;
  },
});
