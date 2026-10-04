// The keeper's chain access, isolated behind this adapter so tests can mock
// it (the same pattern payments tests use for ./chain).
import { Program } from "@coral-xyz/anchor";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { Reservepay } from "../merchant/reservepay";
import idl from "../merchant/reservepay.json";
import { ORDER_STATUS_OFFSET, readChainTime } from "./chain";
import { withRetry } from "../lib/retry";

export type KeeperOpenOrder = {
  order: string;
  merchantPda: string;
  reference: string;
  expiresAt: number; // seconds
};

// confirmTransaction does not throw for a failed transaction in this web3.js
// version, so callers must check value.err. This names known program errors
// (for example OrderClosed) from the IDL.
export function programError(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("InstructionError" in err))
    return null;
  const [, inner] = (err as { InstructionError: [number, unknown] })
    .InstructionError;
  if (typeof inner !== "object" || inner === null || !("Custom" in inner))
    return null;
  const code = (inner as { Custom: number }).Custom;
  const errors =
    (idl as { errors?: { code: number; name: string }[] }).errors ?? [];
  return errors.find((error) => error.code === code)?.name ?? null;
}

export function failedTransaction(action: string, err: unknown): Error {
  const name = programError(err);
  return new Error(`${action} failed: ${name ?? JSON.stringify(err)}`);
}

export function keeperChain(rpc: Connection) {
  const program = new Program<Reservepay>(idl as Reservepay, {
    connection: rpc,
  });
  // .all() adds the discriminator filter itself; the memcmp matches the
  // 1-byte status enum (Open = 0, Disputed = 3; programs/reservepay/src/lib.rs).
  const ordersByStatus = async (
    statusByte: number,
  ): Promise<KeeperOpenOrder[]> => {
    const accounts = await withRetry(() =>
      program.account.order.all([
        {
          memcmp: {
            offset: ORDER_STATUS_OFFSET,
            bytes: bs58.encode([statusByte]),
          },
        },
      ]),
    );
    return accounts.map(({ publicKey, account }) => ({
      order: publicKey.toBase58(),
      merchantPda: account.merchant.toBase58(),
      reference: Buffer.from(account.reference).toString("hex"),
      expiresAt: account.expiresAt.toNumber(),
    }));
  };
  return {
    async openOrders(): Promise<KeeperOpenOrder[]> {
      return ordersByStatus(0);
    },
    // Disputed orders are still open liability, resolvable only by the
    // resolver, so the keeper must never release them.
    async disputedOrders(): Promise<KeeperOpenOrder[]> {
      return ordersByStatus(3);
    },
    async merchant(
      merchantPda: string,
    ): Promise<{ authority: string; mint: string } | null> {
      const account = await withRetry(() =>
        program.account.merchant.fetchNullable(new PublicKey(merchantPda)),
      );
      return account
        ? {
            authority: account.authority.toBase58(),
            mint: account.mint.toBase58(),
          }
        : null;
    },
    async ataExists(mint: PublicKey, authority: PublicKey): Promise<boolean> {
      return (
        (await withRetry(() =>
          rpc.getAccountInfo(getAssociatedTokenAddressSync(mint, authority)),
        )) !== null
      );
    },
    balance: (wallet: PublicKey) => withRetry(() => rpc.getBalance(wallet)),
    chainTime: () => withRetry(() => readChainTime(rpc)),
    async send(
      instructions: TransactionInstruction[],
      signer: Keypair,
    ): Promise<string> {
      const lifetime = await rpc.getLatestBlockhash("confirmed");
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
        ...instructions,
      );
      transaction.feePayer = signer.publicKey;
      transaction.recentBlockhash = lifetime.blockhash;
      transaction.sign(signer);
      const signature = await rpc.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      const confirmation = await rpc.confirmTransaction(
        { signature, ...lifetime },
        "confirmed",
      );
      if (confirmation.value.err)
        throw failedTransaction("Release transaction", confirmation.value.err);
      return signature;
    },
  };
}
