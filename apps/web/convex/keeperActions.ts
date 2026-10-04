"use node";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { completeOrderInstructions } from "../src/payments/chain";
import { keeperChain } from "../src/payments/keeper-chain";
import { selectReleasable, type KeeperOrder } from "../src/payments/keeper";
import { syncLink } from "./syncLink";
import type { Id } from "./_generated/dataModel";

const RELEASE_LIMIT = 5;
const LINK_BATCH = 50;
const MAX_RUN_MS = 4 * 60_000;

// A dedicated devnet keypair — not the authority or the resolver. Completing
// an expired order only needs a signer; the keeper never pays rent.
function loadKeeper(): Keypair | null {
  const secret = process.env.KEEPER_SECRET_KEY;
  if (!secret) return null;
  try {
    const bytes = bs58.decode(secret);
    return bytes.length === 64 ? Keypair.fromSecretKey(bytes) : null;
  } catch {
    return null;
  }
}

// The resolver or the merchant can resolve the same order between the
// keeper's read and its send; both outcomes are expected races.
function isResolutionRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /OrderClosed|OrderStillProtected|already been resolved|still open/.test(
    message,
  );
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const keeper = loadKeeper();
    if (!keeper) {
      // Logged once per run, never throws, and never logs key material.
      console.log(
        "keeper: KEEPER_SECRET_KEY is missing or invalid; skipping this run.",
      );
      return { skipped: "unconfigured" as const };
    }
    const started = Date.now();
    const outOfTime = () => Date.now() - started > MAX_RUN_MS;
    const rpc = new Connection(
      process.env.KEEPER_RPC_URL ?? "https://api.devnet.solana.com",
      { commitment: "confirmed", disableRetryOnRateLimit: true },
    );
    const chain = keeperChain(rpc);
    let released = 0,
      skipped = 0,
      failed = 0,
      synced = 0;
    try {
      const [openOrders, chainTime, disputes] = await Promise.all([
        chain.openOrders(),
        chain.chainTime(),
        ctx.runQuery(internal.keeper.openDisputes, {}),
      ]);
      const chainNow = Number(chainTime);
      const wallNow = Date.now();
      const openSet = new Set(openOrders.map((order) => order.order));
      // Merchant accounts give authority and mint; cached once per run.
      const merchants = new Map<
        string,
        { authority: string; mint: string } | null
      >();
      const candidates: (KeeperOrder & { mint: string })[] = [];
      for (const order of openOrders) {
        if (outOfTime()) break;
        if (!merchants.has(order.merchantPda))
          merchants.set(
            order.merchantPda,
            await chain.merchant(order.merchantPda),
          );
        const merchant = merchants.get(order.merchantPda);
        if (merchant)
          candidates.push({
            ...order,
            authority: merchant.authority,
            mint: merchant.mint,
          });
      }
      const links: Record<
        string,
        { id: Id<"paymentLinks">; refundPending: boolean }
      > = {};
      // An order whose refund request was never checked looks unlinked, and
      // unlinked orders are treated as safe to release. If the refund-request
      // check did not finish, release nothing this run.
      let linksComplete = true;
      for (let start = 0; start < candidates.length; start += LINK_BATCH) {
        if (outOfTime()) {
          linksComplete = false;
          break;
        }
        Object.assign(
          links,
          await ctx.runQuery(internal.keeper.linksForReferences, {
            refs: candidates
              .slice(start, start + LINK_BATCH)
              .map(({ authority, reference }) => ({ authority, reference })),
          }),
        );
      }
      if (!linksComplete)
        console.log(
          "keeper: ran out of time before checking every refund request; no orders were released this run.",
        );
      const selected = linksComplete
        ? selectReleasable({
            openOrders: candidates,
            links,
            chainNow,
            wallNow,
            limit: candidates.length,
          })
        : [];
      // Missing token accounts need manual release. Check eligibility before
      // applying the send cap, or the oldest skipped orders starve the queue.
      const ready: typeof selected = [];
      const tokenAccounts = new Map<string, boolean>();
      for (const order of selected) {
        if (outOfTime() || ready.length >= RELEASE_LIMIT) break;
        const key = `${order.mint}:${order.authority}`;
        if (!tokenAccounts.has(key))
          tokenAccounts.set(
            key,
            await chain.ataExists(
              new PublicKey(order.mint),
              new PublicKey(order.authority),
            ),
          );
        if (!tokenAccounts.get(key)) {
          skipped += 1;
          continue;
        }
        ready.push(order);
      }
      const attempts = await Promise.allSettled(
        ready.map(async (order) => {
          if (outOfTime()) return "skipped" as const;
          const authority = new PublicKey(order.authority);
          const mint = new PublicKey(order.mint);
          const instructions = await completeOrderInstructions(rpc, {
            order: new PublicKey(order.order),
            merchantPda: new PublicKey(order.merchantPda),
            authority,
            mint,
            caller: keeper.publicKey,
            createAta: false,
          });
          const signature = await chain.send(instructions, keeper);
          // Finalization takes about 13s; 90s is safely after it.
          if (order.linkId)
            await ctx.scheduler.runAfter(
              90_000,
              internal.paymentActions.syncById,
              { id: order.linkId as Id<"paymentLinks"> },
            );
          console.log(
            `keeper: released order ${order.order} in transaction ${signature}.`,
          );
          return "released" as const;
        }),
      );
      for (const attempt of attempts) {
        if (attempt.status === "fulfilled") {
          if (attempt.value === "released") released += 1;
          else skipped += 1;
        } else if (isResolutionRace(attempt.reason)) {
          console.log(
            `keeper: an order was already resolved elsewhere; ${
              attempt.reason instanceof Error
                ? attempt.reason.message
                : "race"
            }`,
          );
          skipped += 1;
        } else {
          console.error("keeper: release failed", attempt.reason);
          failed += 1;
        }
      }
      // Reconcile disputes resolved on-chain but never synced (for example a
      // resolver who closed the tab right after signing). Disputes still open
      // on-chain are skipped, so this costs no RPC for them.
      for (const link of disputes) {
        if (outOfTime()) break;
        if (!link.receipt || openSet.has(link.receipt.order)) continue;
        try {
          if (await syncLink(ctx, link, rpc)) synced += 1;
        } catch (error) {
          console.error(`keeper: could not sync dispute ${link._id}`, error);
        }
      }
    } catch (error) {
      console.error("keeper: run failed", error);
    }
    return { released, skipped, failed, synced };
  },
});
