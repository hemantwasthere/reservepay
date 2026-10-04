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
  return new Error(
    `${action} failed: ${name ?? JSON.stringify(err)}`,
  );
}

export function keeperChain(rpc: Connection) {
  const program = new Program<Reservepay>(idl as Reservepay, {
    connection: rpc,
  });
  return {
    // Open orders only: .all() adds the discriminator filter itself, and
    // bs58.encode([0]) === "1" is the Open status byte.
    async openOrders(): Promise<KeeperOpenOrder[]> {
      const accounts = await program.account.order.all([
        { memcmp: { offset: ORDER_STATUS_OFFSET, bytes: bs58.encode([0]) } },
      ]);
      return accounts.map(({ publicKey, account }) => ({
        order: publicKey.toBase58(),
        merchantPda: account.merchant.toBase58(),
        reference: Buffer.from(account.reference).toString("hex"),
        expiresAt: account.expiresAt.toNumber(),
      }));
    },
    async merchant(
      merchantPda: string,
    ): Promise<{ authority: string; mint: string } | null> {
      const account = await program.account.merchant.fetchNullable(
        new PublicKey(merchantPda),
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
        (await rpc.getAccountInfo(getAssociatedTokenAddressSync(mint, authority))) !==
        null
      );
    },
    chainTime: () => readChainTime(rpc),
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
