import { Connection, type Commitment } from "@solana/web3.js";

// Server-side RPC for internal actions only: the reconciler, the keeper and
// syncById. Public actions stay on public devnet — they are unauthenticated,
// so routing them through a private RPC would let anyone spend its quota.
// Reads env at call time so redeploys and tests pick up changes.
export function serverRpc(commitment: Commitment): Connection {
  return new Connection(
    process.env.SOLANA_RPC_URL ??
      process.env.KEEPER_RPC_URL ??
      "https://api.devnet.solana.com",
    { commitment, disableRetryOnRateLimit: true },
  );
}
