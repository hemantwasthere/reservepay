"use node";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { trackWorker } from "./trackWorker";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { completeOrderInstructions } from "../src/payments/chain";
import { keeperChain } from "../src/payments/keeper-chain";
import { selectReleasable, type KeeperOrder } from "../src/payments/keeper";
import { syncLinks } from "./syncLink";
import { serverRpc } from "./rpc";
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
  return /OrderClosed|OrderStillProtected|OrderUnderDispute|already been resolved|still open/.test(
    message,
  );
}

type KeeperResult =
  | { skipped: "unconfigured" }
  | { released: number; skipped: number; failed: number; synced: number };

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<KeeperResult> =>
    trackWorker<KeeperResult>(ctx, "keeper", async () => {
      const keeper = loadKeeper();
      if (!keeper) {
        // Logged once per run, never throws, and never logs key material.
        console.log(
          "keeper: KEEPER_SECRET_KEY is missing or invalid; skipping this run.",
        );
        return {
          result: { skipped: "unconfigured" as const },
          issue: "unconfigured",
        };
      }
      const started = Date.now();
      const outOfTime = () => Date.now() - started > MAX_RUN_MS;
      const rpc = serverRpc("confirmed");
      const chain = keeperChain(rpc);
      let released = 0,
        skipped = 0,
        failed = 0,
        synced = 0,
        // Receipt writes left for the next run when the budget ran out.
        deferred = 0;
      let lowFunds = false;
      try {
        lowFunds = (await chain.balance(keeper.publicKey)) < 1_000_000;
        // One program-account scan per run: Open orders only. Disputed
        // orders are never release candidates, and the dispute reconcile
        // below recognises them from the stored receipt instead of a second
        // full scan (the reconciler's scan is what discovers new disputes).
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
        // Rotate after the last attempted order, including failed sends. Five
        // frozen accounts must not monopolize every run and starve newer orders.
        const cursor = await ctx.runQuery(internal.reconcile.getCursor, {
          name: "keeperRelease",
        });
        const after = selected.findIndex((order) => order.order === cursor) + 1;
        const queue = [...selected.slice(after), ...selected.slice(0, after)];
        const ready: typeof selected = [];
        const tokenAccounts = new Map<string, boolean>();
        for (const order of queue) {
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
        if (ready.length > 0)
          await ctx.runMutation(internal.reconcile.setCursor, {
            name: "keeperRelease",
            cursor: ready[ready.length - 1].order,
          });
        for (const attempt of attempts) {
          if (attempt.status === "fulfilled") {
            if (attempt.value === "released") released += 1;
            else skipped += 1;
          } else if (isResolutionRace(attempt.reason)) {
            console.log("keeper: an order was already resolved elsewhere.");
            skipped += 1;
          } else {
            console.error("keeper: release failed; retrying on a later run.");
            failed += 1;
          }
        }
        // Reconcile disputes resolved on-chain but never synced (for example a
        // resolver who closed the tab right after signing). One batched read
        // for all of them — the same step the reconciler runs — never one read
        // per link. Disputes still open on-chain are skipped, so this costs no
        // RPC for them: Open orders are in openSet, and an order recorded as
        // Disputed (which only the resolver can leave) is left to the
        // reconciler, whose scan includes Disputed orders.
        const staleDisputes = disputes.filter(
          (link) =>
            link.receipt &&
            !openSet.has(link.receipt.order) &&
            !link.receipt.disputed,
        );
        if (staleDisputes.length > 0 && !outOfTime()) {
          // Stops writing receipts once the run budget is spent; the rest are
          // deferred to the next run (the run is then reported incomplete).
          const result = await syncLinks(ctx, staleDisputes, rpc, outOfTime);
          synced += result.synced;
          failed += result.failed + result.mismatched;
          deferred += result.deferred;
        }
      } catch {
        failed += 1;
        console.error("keeper: run failed; retrying next scheduled run.");
      }
      return {
        result: { released, skipped, failed, synced },
        issue: lowFunds
          ? "low_funds"
          : failed > 0
            ? "failed"
            : outOfTime() || skipped > 0 || deferred > 0
              ? "incomplete"
              : null,
      };
    }),
});
