import { Transaction, type Connection } from "@solana/web3.js";
import bs58 from "bs58";
import type { ReserveAction } from "./client";
import { withRetry } from "../lib/retry";

export type PendingTransaction = {
  signature: string;
  lastValidBlockHeight: number;
  action: ReserveAction;
  amount: string;
  address: string;
  createdAt: number;
};
export type TransactionResult = "pending" | "confirmed" | "failed" | "expired";
const key = (address: string) => `reservepay:devnet:pending:${address}`;

export function loadPending(address: string): PendingTransaction | null {
  const raw = localStorage.getItem(key(address));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingTransaction;
  if (
    value.address !== address ||
    !["register", "fund", "withdraw"].includes(value.action) ||
    typeof value.signature !== "string" ||
    bs58.decode(value.signature).length !== 64 ||
    !Number.isSafeInteger(value.lastValidBlockHeight) ||
    value.lastValidBlockHeight <= 0 ||
    typeof value.amount !== "string"
  )
    throw new Error(
      "Saved transaction data could not be read. Check your wallet activity before making another transfer.",
    );
  return value;
}

export function savePending(value: PendingTransaction) {
  localStorage.setItem(key(value.address), JSON.stringify(value));
}

export function clearPending(value: PendingTransaction) {
  if (loadPending(value.address)?.signature === value.signature)
    localStorage.removeItem(key(value.address));
}

export function validateSignedTransaction(
  original: Transaction,
  bytes: Uint8Array,
): { signature: string; bytes: Uint8Array } {
  const signed = Transaction.from(bytes);
  if (
    !signed.serializeMessage().equals(original.serializeMessage()) ||
    !signed.verifySignatures() ||
    !signed.signature
  )
    throw new Error(
      "The wallet returned a different or invalid transaction. Nothing was submitted.",
    );
  return {
    signature: bs58.encode(signed.signature),
    bytes: new Uint8Array(signed.serialize()),
  };
}

export async function transactionResult(
  rpc: Connection,
  pending: Pick<PendingTransaction, "signature" | "lastValidBlockHeight">,
): Promise<TransactionResult> {
  // Each read retries on its own, so a recovered block-height check still
  // triggers the "past expiry → re-read status" lookup in order.
  const getStatus = async () =>
    (
      await withRetry(() =>
        rpc.getSignatureStatuses([pending.signature], {
          searchTransactionHistory: true,
        }),
      )
    ).value[0];
  let status = await getStatus();
  if (
    !status &&
    (await withRetry(() => rpc.getBlockHeight("finalized"))) >
      pending.lastValidBlockHeight
  ) {
    status = await getStatus();
    if (!status) return "expired";
  }
  if (status?.err) return "failed";
  if (
    status?.confirmationStatus === "confirmed" ||
    status?.confirmationStatus === "finalized"
  )
    return "confirmed";
  return "pending";
}
