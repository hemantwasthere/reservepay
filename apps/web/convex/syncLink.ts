import type { ActionCtx } from "./_generated/server";
import type { Connection } from "@solana/web3.js";
import { internal } from "./_generated/api";
import { paymentClient, type OrderReceipt } from "../src/payments/chain";
import type { Doc } from "./_generated/dataModel";

// Shared by paymentActions.sync (public devnet connection), the keeper,
// syncById and the reconciler (server RPC). Reads at finalized so slow RPC
// responses never roll a resolved receipt back to paid.
export async function syncLink(
  ctx: ActionCtx,
  link: Doc<"paymentLinks">,
  connection: Connection,
): Promise<boolean> {
  const receipt = await paymentClient(connection).readOrder(link);
  if (!receipt) return false;
  await ctx.runMutation(internal.payments.record, { id: link._id, receipt });
  return true;
}

export type SyncSummary = {
  synced: number;
  missing: number;
  mismatched: number;
  failed: number;
};

// Batched variant for the reconciler. Mismatches are counted, not logged per
// link: anyone can create an order for a link's reference with a different
// amount (it stays Open forever), and per-link logs would spam every run.
// A failed chunk counts every link in the call as failed so the caller can
// retry the same page next run instead of skipping links.
export async function syncLinks(
  ctx: ActionCtx,
  links: Doc<"paymentLinks">[],
  connection: Connection,
): Promise<SyncSummary> {
  let receipts: Map<string, OrderReceipt | null | Error>;
  try {
    receipts = await paymentClient(connection).readOrders(
      links.map((link) => ({ id: link._id as string, terms: link })),
    );
  } catch {
    return { synced: 0, missing: 0, mismatched: 0, failed: links.length };
  }
  const summary = { synced: 0, missing: 0, mismatched: 0, failed: 0 };
  for (const link of links) {
    const receipt = receipts.get(link._id);
    if (receipt === undefined) summary.failed += 1;
    else if (receipt instanceof Error) summary.mismatched += 1;
    else if (!receipt) summary.missing += 1;
    else {
      await ctx.runMutation(internal.payments.record, {
        id: link._id,
        receipt,
      });
      summary.synced += 1;
    }
  }
  return summary;
}
