// Idempotent devnet protocol setup. Prints public keys only — never key
// material. Usage:
//
//   bun apps/web/scripts/setup-protocol.ts [--resolver <pubkey>] [--dry-run] [--url <rpc>]
//
// The wallet comes from ANCHOR_WALLET, defaulting to ~/.config/solana/id.json.
// Initialization uses the program's existing default of 500 bps.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { planProtocolSetup, protocolAddress } from "@reservepay/core";
import { failedTransaction } from "../src/payments/keeper-chain";
import type { Reservepay } from "../src/merchant/reservepay";
import idl from "../src/merchant/reservepay.json";

const DEFAULT_RESERVE_BPS = 500;

function parseFlags(argv: string[]) {
  const flags = {
    resolver: undefined as string | undefined,
    dryRun: false,
    url: "https://api.devnet.solana.com",
  };
  const value = (flag: string, next: string | undefined) => {
    if (!next || next.startsWith("--"))
      throw new Error(`Flag ${flag} needs a value.`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--dry-run") flags.dryRun = true;
    else if (argv[index] === "--resolver")
      flags.resolver = value("--resolver", argv[++index]);
    else if (argv[index] === "--url") flags.url = value("--url", argv[++index]);
    else throw new Error(`Unknown flag: ${argv[index]}`);
  }
  if (flags.resolver) new PublicKey(flags.resolver);
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const walletPath =
  process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`;
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(walletPath, "utf8")) as number[]),
);
const connection = new Connection(flags.url, "confirmed");
const program = new Program<Reservepay>(idl as Reservepay, { connection });
const account = await program.account.protocol.fetchNullable(
  protocolAddress(),
);
const current = account
  ? {
      authority: account.authority.toBase58(),
      resolver: account.resolver.toBase58(),
    }
  : null;
const plan = planProtocolSetup(current, wallet.publicKey.toBase58(), {
  ...(flags.resolver ? { resolver: flags.resolver } : {}),
});

console.log(`RPC: ${flags.url}`);
console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
console.log(`Protocol PDA: ${protocolAddress().toBase58()}`);
if (current) {
  console.log(`Current authority: ${current.authority}`);
  console.log(`Current resolver: ${current.resolver}`);
} else {
  console.log("Protocol: not initialized");
}
console.log(
  plan.action === "noop"
    ? "Plan: noop — already up to date."
    : `Plan: ${plan.action} with resolver ${plan.resolver}`,
);

if (flags.dryRun) console.log("Dry run; nothing was sent.");
else if (plan.action !== "noop") {
  const instruction =
    plan.action === "init"
      ? await program.methods
          .initializeProtocol(new PublicKey(plan.resolver), DEFAULT_RESERVE_BPS)
          .accountsStrict({
            protocol: protocolAddress(),
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .instruction()
      : await program.methods
          .setResolver(new PublicKey(plan.resolver))
          .accountsStrict({
            protocol: protocolAddress(),
            authority: wallet.publicKey,
          })
          .instruction();
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;
  transaction.sign(wallet);
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    { skipPreflight: false, preflightCommitment: "confirmed" },
  );
  const confirmation = await connection.confirmTransaction(
    signature,
    "confirmed",
  );
  // confirmTransaction does not throw for a failed transaction; a failed
  // setup must not print a signature as if it worked.
  if (confirmation.value.err)
    throw failedTransaction("Setup transaction", confirmation.value.err);
  console.log(`Signature: ${signature}`);
}
