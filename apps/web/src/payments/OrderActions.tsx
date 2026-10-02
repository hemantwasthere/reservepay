import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { WalletConnection } from "../lib/WalletControl";
import { connection, exactAmount, explorer } from "../merchant/client";
import {
  validateSignedTransaction,
  transactionResult,
} from "../merchant/transactions";
import { paymentClient } from "./chain";
import { refundApproval, refundReasons, type RefundReason } from "./refunds";
import {
  loadResolution,
  saveResolution,
  clearResolution,
  type PendingResolution,
  type Resolution,
} from "./resolution-pending";

const client = paymentClient(connection);
const errorText = (error: unknown) =>
  error instanceof ConvexError
    ? String(error.data)
    : error instanceof Error
      ? error.message
      : "Please try again.";
export function OrderActions({
  link,
  active,
  setLocked,
  isCurrent,
}: {
  link: Doc<"paymentLinks">;
  active: WalletConnection | null;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
}) {
  const receipt = link.receipt!;
  const requestRefund = useAction(api.paymentActions.requestRefund);
  const sync = useAction(api.paymentActions.sync);
  const [resolver, setResolver] = useState("");
  const [roleError, setRoleError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [reason, setReason] = useState<RefundReason>("not_received");
  const [dialog, setDialog] = useState<Resolution | "request" | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [journalError, setJournalError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingResolution | null>(null);
  const [message, setMessage] = useState("");
  const lastDialog = useRef<Resolution | "request">("request");
  if (dialog) lastDialog.current = dialog;
  const displayedAction = dialog ?? lastDialog.current;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const value = await client.readResolver();
        if (!cancelled) {
          setResolver(value.toBase58());
          setRoleError("");
        }
      } catch {
        if (!cancelled) {
          setResolver("");
          setRoleError(
            "Could not verify the resolver. Retrying automatically…",
          );
        }
      }
      if (!cancelled) setNow(Date.now());
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const read = () => {
      try {
        if (receipt.status !== "paid") clearResolution(link._id);
        setPending(loadResolution(link._id));
        setJournalError("");
      } catch (e) {
        setJournalError(errorText(e));
      }
      setLoaded(true);
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [link._id, receipt.status]);
  useEffect(() => {
    if (!pending || receipt.status !== "paid") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        await sync({ id: link._id });
        const result = await transactionResult(connection, pending);
        if (cancelled) return;
        if (result === "failed" || result === "expired") {
          clearResolution(link._id);
          setPending(null);
          setError("The transaction did not complete. You can try again.");
        } else
          setMessage(
            result === "confirmed"
              ? "Transaction confirmed. Waiting for the finalized receipt…"
              : "Waiting for confirmation. Do not submit again.",
          );
      } catch {
        if (!cancelled)
          setMessage(
            "Confirmation is temporarily unavailable. Your transaction is saved; do not submit again.",
          );
      }
      if (!cancelled) timer = setTimeout(() => void check(), 5000);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, receipt.status, link._id, sync]);

  const submit = async () => {
    if (
      !active ||
      !dialog ||
      inFlight.current ||
      pending ||
      journalError ||
      !loaded
    )
      return;
    const wallet = active,
      action = dialog;
    inFlight.current = true;
    setLocked(true);
    setError("");
    setMessage("");
    try {
      if (action === "request") {
        if (!wallet.wallet.signMessage)
          throw new Error("Use a wallet that supports message signing.");
        const request = {
          id: link._id,
          order: receipt.order,
          buyer: wallet.account.address,
          reason,
          issuedAt: Date.now(),
        };
        setBusy("Approve the request in your wallet…");
        const signature = await wallet.wallet.signMessage(
          wallet.account.address,
          refundApproval(request),
        );
        if (!isCurrent(wallet))
          throw new Error("Your wallet changed. Please try again.");
        setBusy("Saving your request…");
        await requestRefund({ ...request, signature: bs58.encode(signature) });
        if (mounted.current) {
          setDialog(null);
          setMessage(
            "Refund requested. The resolver can now review this order.",
          );
        }
      } else {
        const send = async () => {
          if (loadResolution(link._id))
            throw new Error(
              "A transaction is already pending for this order. Wait for confirmation.",
            );
          if (!wallet.wallet.signTransaction)
            throw new Error("Use a wallet that supports devnet transactions.");
          setBusy("Checking the on-chain order…");
          const prepared = await client.prepareResolution(
            link,
            new PublicKey(wallet.account.address),
            action,
          );
          if (!isCurrent(wallet))
            throw new Error("Your wallet changed. Please try again.");
          setBusy("Approve the transaction in your wallet…");
          const bytes = await wallet.wallet.signTransaction(
            wallet.account.address,
            prepared.transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            }),
          );
          if (!isCurrent(wallet))
            throw new Error("Your wallet changed. Please try again.");
          const signed = validateSignedTransaction(prepared.transaction, bytes);
          const saved = {
            signature: signed.signature,
            lastValidBlockHeight: prepared.lastValidBlockHeight,
            signer: wallet.account.address,
            action,
          };
          saveResolution(link._id, saved); // Persist before broadcast, including ambiguous RPC failures.
          if (mounted.current) {
            setPending(saved);
            setDialog(null);
            setMessage("Waiting for confirmation…");
          }
          try {
            await connection.sendRawTransaction(signed.bytes, {
              skipPreflight: false,
              preflightCommitment: "confirmed",
              maxRetries: 3,
            });
          } catch {
            if (mounted.current)
              setMessage(
                "Submission could not be confirmed. Checking your saved transaction; do not submit again.",
              );
          }
        };
        if (navigator.locks)
          await navigator.locks.request(
            `reservepay:resolution:${link._id}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock)
                throw new Error("This order is being resolved in another tab.");
              await send();
            },
          );
        else await send();
      }
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      inFlight.current = false;
      setLocked(false);
      if (mounted.current) setBusy("");
    }
  };
  const isResolver = Boolean(active && active.account.address === resolver);
  const isMerchant = active?.account.address === link.merchant;
  const isBuyer = active?.account.address === receipt.buyer;
  const expired = now >= receipt.expiresAt;
  const disabled = Boolean(busy || pending || journalError || !loaded);
  const canRequest = isBuyer && !expired && !link.refundRequest;
  return (
    <section
      className="mt-6 border-t border-border pt-6"
      aria-label="Order resolution"
    >
      {receipt.status !== "paid" ? (
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          {receipt.status === "refunded"
            ? "The full payment has been returned to the original buyer’s token account."
            : "This order is complete. The reserved portion has been released to the merchant and this order can no longer be refunded."}
        </p>
      ) : (
        <>
          <h3 className="text-base font-medium">
            {link.refundRequest ? "Refund requested" : "Manage this order"}
          </h3>
          {link.refundRequest && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-4 text-sm leading-6">
              <p>{refundReasons[link.refundRequest.reason]}</p>
              <p className="text-xs text-muted-foreground">
                Requested{" "}
                {new Date(link.refundRequest.requestedAt).toLocaleString()} ·
                Awaiting resolver decision
              </p>
            </div>
          )}
          <p className="my-3 text-xs leading-6 text-muted-foreground">
            {expired
              ? "The protection period has ended. The merchant can complete this order."
              : "The buyer can request a full refund during the protection period. Only the configured resolver can approve it."}{" "}
            A request does not extend protection or prevent completion. A
            completed order cannot be refunded.
          </p>
          {!active && (
            <p className="my-3 text-sm text-muted-foreground">
              Connect the buyer, merchant, or resolver wallet to manage this
              order.
            </p>
          )}
          {isBuyer &&
            !expired &&
            !link.refundRequest &&
            !active?.wallet.signMessage && (
              <p className="my-3 text-xs text-muted-foreground">
                Switch to a wallet with message signing to request a refund.
              </p>
            )}
          {(isResolver || (isMerchant && expired)) &&
            !active?.wallet.signTransaction && (
              <p className="my-3 text-xs text-muted-foreground">
                Switch to a wallet with devnet transaction signing to resolve
                this order.
              </p>
            )}
          <div className="flex flex-wrap gap-3">
            {canRequest && (
              <Button
                variant="outline"
                disabled={disabled || !active?.wallet.signMessage}
                onClick={() => {
                  setError("");
                  setDialog("request");
                }}
              >
                Request refund
              </Button>
            )}
            {isResolver && (
              <Button
                variant="outline"
                disabled={disabled || !active?.wallet.signTransaction}
                onClick={() => {
                  setError("");
                  setDialog("refund");
                }}
              >
                Approve full refund
              </Button>
            )}
            {(isResolver || (isMerchant && expired)) && (
              <Button
                variant="brand"
                disabled={disabled || !active?.wallet.signTransaction}
                onClick={() => {
                  setError("");
                  setDialog("complete");
                }}
              >
                Complete order
              </Button>
            )}
          </div>
          {roleError && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {roleError}
            </p>
          )}
          {pending && (
            <a
              className="mt-4 inline-flex items-center gap-2 text-xs text-primary underline underline-offset-4"
              href={explorer(pending.signature, "tx")}
              target="_blank"
              rel="noreferrer"
            >
              View pending{" "}
              {pending.action === "refund" ? "refund" : "completion"}
              <ArrowUpRight size={14} />
            </a>
          )}
          {(busy || message) && (
            <p
              className="mt-3 text-xs leading-6 text-muted-foreground"
              role="status"
            >
              {busy || message}
            </p>
          )}
        </>
      )}
      {(error || journalError) && !dialog && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error || journalError}
        </p>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {displayedAction === "request"
                ? "Request a full refund"
                : displayedAction === "refund"
                  ? "Approve full refund"
                  : "Complete this order"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {displayedAction === "request"
                ? "Sign a message to submit this request. Your reason is public. The resolver must approve a separate transaction; this does not extend protection or guarantee a refund."
                : displayedAction === "refund"
                  ? `Return ${exactAmount(BigInt(link.amount))} devnet USDC from the merchant’s reserve to the original buyer. This closes the order permanently.`
                  : `Release ${exactAmount(BigInt(receipt.reserveAmount))} devnet USDC to the merchant and unlock this order’s full liability. This permanently closes the order and prevents any refund${link.refundRequest ? ", including the buyer’s pending request" : ""}.`}
            </DialogDescription>
          </DialogHeader>
          {displayedAction === "request" && (
            <div className="space-y-2">
              <label htmlFor="refund-reason" className="text-sm">
                Reason
              </label>
              <NativeSelect
                id="refund-reason"
                value={reason}
                disabled={Boolean(busy)}
                onChange={(event) =>
                  setReason(event.target.value as RefundReason)
                }
              >
                {Object.entries(refundReasons).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          {displayedAction !== "request" && (
            <p className="text-xs text-muted-foreground">
              The signing wallet pays the devnet SOL network fee. Review the
              recipient and amount in your wallet.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="text-xs text-muted-foreground">
              {busy}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={disabled}
              onClick={() => void submit()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {displayedAction === "request"
                ? "Sign refund request"
                : "Review in wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
