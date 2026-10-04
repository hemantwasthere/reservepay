# Devnet operations

Everything on this page is public information. Keep key material out of docs, git, and browser configuration.

## Accounts

| Account | Address |
| --- | --- |
| ReservePay program | [`ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU`](https://explorer.solana.com/address/ERFq8y9tC4bjMk4AbLoM7zZXtvRcxsHdCMa9GpSnwxsU?cluster=devnet) |
| Protocol PDA | [`5ZBgXZK52BbeJyap8dEcammaxkCXDfzrfEaFsPmRUvTt`](https://explorer.solana.com/address/5ZBgXZK52BbeJyap8dEcammaxkCXDfzrfEaFsPmRUvTt?cluster=devnet) |
| Protocol authority | [`32Sq2bL8zdH6iQinTohLzeQSG33vHn6qzcijBULpzfGp`](https://explorer.solana.com/address/32Sq2bL8zdH6iQinTohLzeQSG33vHn6qzcijBULpzfGp?cluster=devnet) |
| Protocol resolver | [`32Sq2bL8zdH6iQinTohLzeQSG33vHn6qzcijBULpzfGp`](https://explorer.solana.com/address/32Sq2bL8zdH6iQinTohLzeQSG33vHn6qzcijBULpzfGp?cluster=devnet) |
| Devnet USDC mint | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) |

The hosted devnet keeper uses dedicated wallet `5556UPZyL24ikCtuv3x5tmxzbz9ASFAKi1rjJEApMS4z`. Its secret is stored in the Convex `KEEPER_SECRET_KEY` environment variable, never in browser configuration or Git. It was initially funded with 0.05 test SOL.

## Protocol setup

`apps/web/scripts/setup-protocol.ts` initializes the protocol PDA or rotates its resolver, idempotently. The wallet comes from `ANCHOR_WALLET` (default `~/.config/solana/id.json`) and must be the protocol authority for any change to an existing protocol.

```bash
# Show what would happen, against the current devnet state:
bun apps/web/scripts/setup-protocol.ts --dry-run

# Initialize (only when the protocol PDA does not exist), resolver = wallet:
bun apps/web/scripts/setup-protocol.ts

# Rotate the resolver (authority wallet required):
bun apps/web/scripts/setup-protocol.ts --resolver <new-resolver-pubkey>
```

Initialization uses the program's default reserve rate of 500 bps. The script prints public keys and the transaction signature only.

## Keeper

A Convex cron runs the keeper every 5 minutes. It completes orders whose protection expired (chain clock past expiry, and wall clock at least 60 seconds past it, so no new refund request can still arrive) and that have no pending refund request. It also syncs disputes whose on-chain resolution was never recorded. The keeper never pays rent: orders whose merchant token account is missing are left for manual release from the receipt page.

## Reconciliation

A separate Convex cron reconciles payment receipts with Solana every 2 minutes. It needs no `KEEPER_SECRET_KEY` and keeps running when the keeper is unconfigured. Each run:

1. scans open orders on-chain and records receipts for links paid while no client was watching (for example a buyer who closed the tab right after sending);
2. syncs disputes whose on-chain resolution was never recorded;
3. re-checks a page of links whose receipt says "paid" but whose order is no longer open, recording completed or refunded outcomes;
4. sweeps a page of links with no receipt at all, catching orders paid and resolved before anyone synced.

Receipts are read at finalized commitment and `payments.record` never regresses a status, so reconciliation can only move a receipt forward or leave it unchanged. Paged steps resume from cursors stored in the `syncState` table; a failed page retries next run instead of skipping links. If the open-order scan itself fails, the steps that compare against it skip the run and the summary shows `scanFailed: true`, so a persistently rate-limited RPC is visible rather than mistaken for a quiet run. A step skipped for any other reason — a failed page read or the 90-second budget running out — is named in the summary's `skipped` list (step names only). Each run logs one summary line (counts only, never link documents or env values).

### Configure

```bash
# Dedicated keypair — never the authority or resolver key:
solana-keygen new -o ~/.config/solana/reservepay-keeper.json
solana airdrop 1 <keeper-pubkey> --url devnet
```

`KEEPER_SECRET_KEY` expects the base58 encoding of the 64-byte secret key. From `apps/web`, this converts the keeper key file and sends it to the selected deployment without printing it:

```bash
bun -e 'import bs58 from "bs58"; import {readFileSync} from "node:fs"; import {homedir} from "node:os"; console.log(bs58.encode(Uint8Array.from(JSON.parse(readFileSync(homedir()+"/.config/solana/reservepay-keeper.json", "utf8")))))' | bunx convex env set KEEPER_SECRET_KEY
```

If the variable is unset or invalid, every keeper run skips with `{ skipped: "unconfigured" }` and records the disabled status without changing orders. Unsetting it stops new keeper runs; an already-running action may finish its current work. Reconciliation keeps running because it needs no key.

### RPC

Public devnet `getProgramAccounts` from shared Convex IPs is rate-limited. Point the keeper and the reconciler at a dedicated RPC when you have one:

```bash
bunx convex env set SOLANA_RPC_URL https://your-rpc.example.com
```

`KEEPER_RPC_URL` is kept as a fallback alias. Without either, internal actions use `https://api.devnet.solana.com`, where the built-in retry absorbs occasional 429s. Public actions (`paymentActions.sync`, `requestRefund`) intentionally stay on public devnet: they are unauthenticated, so a private RPC's quota would be spendable by anyone.

### Operation

One run attempts at most 5 releases and stops starting new work after 4 minutes. The queue starts with the oldest eligible orders, then resumes after the last attempted order on the following run, including after failed sends. This prevents frozen token accounts or repeated preflight failures from blocking newer orders. Missing token accounts are skipped before the attempt limit. A confirmed release schedules a receipt sync 90 seconds later (finalization takes about 13 seconds). Expected races — a resolver or merchant completing the same order first — are logged and counted as skipped. The keeper spends only transaction fees, never token-account rent; check its SOL balance after the first hour and top up with a devnet airdrop when low.

## Public endpoint limits

Anonymous endpoints are bounded so no caller can spend unlimited RPC reads or writes. Each bucket is consumed only after the cheap proof that the caller is legitimate (a verified signature or the recorded receipt), and is keyed on validated identifiers — never on raw client input.

| Endpoint | Limit | When exceeded |
| --- | --- | --- |
| `demoOrders.create` | 20/min per session key, 60/min globally | rejected |
| `paymentActions.sync` | 1 chain read per 5s per link | coalesced, not denied: returns the already-recorded receipt state with no new RPC read |
| `authActions.signIn` | 10/min per wallet | rejected |
| `paymentActions.requestRefund` | 5/min per link, after the recorded receipt proves the caller is the buyer | rejected |

`sync` coalescing means checkout polling, multiple tabs, and merchant refreshes all keep working while backend cost stays capped at one chain read and one receipt write per 5 seconds per link; internal paths (`syncById`, the reconciler, the keeper) are unaffected. `paymentActions.requirePayable`, `payments.get`, the refund queue and `authActions.requestNonce` stay unlimited: they are read-only or stateless and perform no write or chain read.

The landing-page demo is a simulation: demo orders older than 24 hours are deleted by an hourly cron, and the 60/min global cap bounds growth between runs. Rate-limit buckets themselves expire ten minutes after their window and are swept every 30 minutes.

## Service health and recovery

The merchant workspace shows **Payment updates**, **Automatic releases**, and **Inbox reminders**, their current status, and time since the last successful run. The backend stores one heartbeat per worker in `workerHealth`; public status exposes fixed issue codes and timestamps only. An overlapping older run cannot overwrite a newer result. Unexpected action errors count as failures; raw RPC errors are never saved or logged by these workers.

- Payment updates and inbox reminders become delayed after 6 minutes without a new run, or when an unfinished run exceeds 2 minutes.
- Automatic releases become delayed after 15 minutes without a new run, or when an unfinished run exceeds 5 minutes.
- A keeper balance below 0.001 devnet SOL shows **Fee wallet needs funding**. Top up the public keeper address with test SOL, then the next successful run clears the warning.
- Missing configuration shows **Not enabled**. A failed or incomplete run stays visible until a later run succeeds. Unpaid links with no on-chain order are normal and do not trigger a warning.

Inspect or verify recovery from `apps/web`:

```bash
bunx convex run workers:status '{}'
bunx convex run reconcileActions:run '{}'
bunx convex run keeperActions:run '{}'
bunx convex run notificationActions:run '{}'
```

A keeper invocation can release eligible devnet orders. If runs fail repeatedly, check Convex cron execution and backend RPC configuration. Missing merchant token accounts require manual completion, which can create the account with wallet approval. For failed token transfers, inspect the merchant token account before retrying. Buyers can refresh their receipt while background updates recover; merchants and resolvers retain manual resolution controls.

These are dashboard health indicators. In-app refund notifications and deadline reminders are enabled; external paging and email/push delivery remain separate work.


## Inbox delivery

`notificationActions.run` runs every two minutes without a keeper key. It reads the resolver from the finalized on-chain protocol account and processes two independent pages of at most 200 links: pending disputes, and paid orders with protection ending within an hour (including overdue orders). Each sweep saves its `notifications:disputes` or `notifications:deadlines` cursor in `syncState` in the same transaction as its notification writes. Retries cannot duplicate an event or reset its read state; an invalid cursor resets and is reported as an incomplete run.

Refund-request writes notify the merchant and buyer atomically with the request. Finalized completion/refund writes notify the merchant, buyer and the resolver most recently notified about that dispute. The sweep backfills existing pending requests and notifies a new resolver after rotation. Orders already resolved before this rollout are not backfilled. The one-hour reminder is skipped if an order is first seen after expiry; it receives the deadline-passed update instead. Reminders use the verified receipt cache and can lag Solana until reconciliation catches up.

Delivery is deduplicated by wallet, link and event kind in `notifications`. Read state is changed only through an authenticated wallet session. Public callers cannot enqueue notifications, supply the resolver or mark another wallet's updates read. The inbox caps displayed unread counts at 99+ and paginates history. Records are retained; deleting them would also remove their delivery-deduplication keys, so do not manually prune without a retention design.

If resolver RPC reads fail, merchant and buyer reminders continue, the worker records a failed health status, and resolver delivery catches up on subsequent passes. No private RPC error messages are logged. A healthy run means the bounded sweep completed; it does not promise that an arbitrarily large backlog was drained in one run. Check protection deadlines directly on receipts, especially during outages.
