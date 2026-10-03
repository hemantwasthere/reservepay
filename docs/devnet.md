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

The keeper uses a dedicated keypair, created as described below. Record its public key here once it exists; the secret goes only into the Convex `KEEPER_SECRET_KEY` environment variable.

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

### Configure

```bash
# Dedicated keypair — never the authority or resolver key:
solana-keygen new -o keeper.json
solana airdrop 1 <keeper-pubkey> --url devnet
```

`KEEPER_SECRET_KEY` expects the base58 encoding of the 64-byte secret key. From `apps/web`, this converts `keeper.json` and sends it to the selected deployment without printing it:

```bash
bun -e 'console.log(require("bs58").encode(Uint8Array.from(JSON.parse(require("fs").readFileSync("keeper.json", "utf8")))))' | bunx convex env set KEEPER_SECRET_KEY
rm keeper.json
```

If the variable is unset or invalid, every keeper run skips with `{ skipped: "unconfigured" }` and changes nothing. Unsetting it stops all releases and reconciliation immediately.

### RPC

Public devnet `getProgramAccounts` from shared Convex IPs is rate-limited. Point the keeper at a dedicated RPC when you have one:

```bash
bunx convex env set KEEPER_RPC_URL https://your-rpc.example.com
```

Without it, the keeper uses `https://api.devnet.solana.com`.

### Operation

One run releases at most 5 orders and stops starting new work after 4 minutes. A confirmed release schedules a receipt sync 90 seconds later (finalization takes about 13 seconds). Expected races — a resolver or merchant completing the same order first — are logged and counted as skipped. The keeper spends only transaction fees, never token-account rent; check its SOL balance after the first hour and top up with a devnet airdrop when low.
