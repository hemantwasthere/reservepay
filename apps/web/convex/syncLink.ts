import type { ActionCtx } from "./_generated/server";
import type { Connection } from "@solana/web3.js";
import { internal } from "./_generated/api";
import { paymentClient } from "../src/payments/chain";
import type { Doc } from "./_generated/dataModel";

// Shared by paymentActions.sync (devnet connection) and the keeper
// (KEEPER_RPC_URL). Reads at finalized so slow RPC responses never roll a
// resolved receipt back to paid.
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
