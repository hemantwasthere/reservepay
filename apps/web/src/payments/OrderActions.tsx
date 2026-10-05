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
import { isWalletRejection, WalletRejected } from "../lib/wallets";
import { connection, exactAmount, explorer } from "../merchant/client";
import {
  validateSignedTransaction,
  transactionResult,
} from "../merchant/transactions";
import { paymentClient } from "./chain";
import {
  refundApproval,
  refundReasonLabels,
  refundReasons,
  type RefundReason,
} from "./refunds";
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
  // Enable only after the matching backend and program are deployed.
  const onchainDisputes = import.meta.env.VITE_ONCHAIN_DISPUTES === "true";
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
  const [resolvedOrder, setResolvedOrder] = useState<string | null>(null);
  const [verifiedDispute, setVerifiedDispute] = useState<string | null>(null);
  const disputed = Boolean(
    receipt.disputed || verifiedDispute === receipt.order,
  );
  const needsReason =
    !link.refundRequest || link.refundRequest.reason === "unspecified";
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
        const saved = loadResolution(link._id);
        if (
          receipt.status !== "paid" ||
          (receipt.disputed && saved?.action === "dispute")
        )
          clearResolution(link._id);
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
  }, [link._id, receipt.status, receipt.disputed]);
  useEffect(() => {
    if (!pending || receipt.status !== "paid") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        // Receipt synchronization must not block recovery when Convex is unavailable.
        void sync({ id: link._id }).catch(() => {});
        const result = await transactionResult(connection, pending);
        if (pending.action === "dispute" && result === "confirmed") {
          const current = await client.readOrder(link, "confirmed");
          if (cancelled) return;
          if (current && (current.disputed || current.status !== "paid")) {
            clearResolution(link._id);
            setPending(null);
            if (current.status === "paid") {
              setVerifiedDispute(current.order);
              setMessage(
                "Dispute confirmed on-chain. Add your reason below if you have not submitted it yet.",
              );
            } else {
              setResolvedOrder(current.order);
              setMessage(
                "The resolver has already decided this order. Refreshing the receipt…",
              );
            }
            return;
          }
        }
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
    let disputeKnown = disputed;
    inFlight.current = true;
    setLocked(true);
    setError("");
    setMessage("");
    try {
      const sendTransaction = async (
        transactionAction: PendingResolution["action"],
      ) => {
        const send = async () => {
          if (loadResolution(link._id))
            throw new Error(
              "A transaction is already pending for this order. Wait for confirmation.",
            );
          if (!wallet.wallet.signTransaction)
            throw new Error("Use a wallet that supports devnet transactions.");
          setBusy("Checking the on-chain order…");
          const signer = new PublicKey(wallet.account.address);
          const prepared =
            transactionAction === "dispute"
              ? await client.prepareRefundRequest(link, signer)
              : await client.prepareResolution(link, signer, transactionAction);
          if (!isCurrent(wallet))
            throw new Error("Your wallet changed. Please try again.");
          setBusy("Approve the transaction in your wallet…");
          let bytes: Uint8Array;
          try {
            bytes = await wallet.wallet.signTransaction(
              wallet.account.address,
              prepared.transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
              }),
            );
          } catch (e) {
            if (isWalletRejection(e)) throw new WalletRejected();
            throw e;
          }
          if (!isCurrent(wallet))
            throw new Error("Your wallet changed. Please try again.");
          const signed = validateSignedTransaction(prepared.transaction, bytes);
          const saved = {
            signature: signed.signature,
            lastValidBlockHeight: prepared.lastValidBlockHeight,
            signer: wallet.account.address,
            action: transactionAction,
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
      };
      if (action === "request") {
        setBusy("Checking the on-chain order…");
        const current = await client.readOrder(link, "confirmed");
        if (!isCurrent(wallet))
          throw new Error("Your wallet changed. Please try again.");
        if (!current || current.status !== "paid")
          throw new Error(
            "This order is already resolved or has not been paid.",
          );
        if (current.buyer !== wallet.account.address)
          throw new Error("Only the buyer can dispute this order.");
        if (current.disputed) {
          disputeKnown = true;
          setVerifiedDispute(current.order);
        }
        if (onchainDisputes && !current.disputed) {
          await sendTransaction("dispute");
          return;
        }

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
        let signature: Uint8Array;
        try {
          signature = await wallet.wallet.signMessage(
            wallet.account.address,
            refundApproval(request),
          );
        } catch (e) {
          if (isWalletRejection(e)) throw new WalletRejected();
          throw e;
        }
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
        await sendTransaction(action);
      }
    } catch (e) {
      if (mounted.current)
        if (e instanceof WalletRejected) {
          // The message renders behind an open dialog; close it so the
          // buyer actually sees the cancellation.
          setDialog(null);
          setMessage(
            action === "request" && disputeKnown
              ? "Reason signing cancelled. Your on-chain dispute remains active; you can add a reason later."
              : "Cancelled in your wallet. Nothing was submitted.",
          );
        } else setError(errorText(e));
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
  const disabled = Boolean(
    busy ||
      pending ||
      journalError ||
      !loaded ||
      resolvedOrder === receipt.order,
  );
  const canRequest =
    isBuyer &&
    ((needsReason && (!expired || disputed)) ||
      (onchainDisputes && !disputed && !expired));
  const canComplete = isResolver || (isMerchant && expired && !disputed);
  const requestLabel = disputed
    ? "Add refund reason"
    : link.refundRequest
      ? "Protect refund request"
      : "Request refund";
  return (
    <section
      className="mt-6 border-t border-border pt-6"
      aria-label="Order resolution"
    >
      {receipt.status !== "paid" ? (
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          {link.refundOutcome && (
            <span className="font-medium text-foreground">
              {link.refundOutcome === "completed"
                ? "Completed · no refund. "
                : "Refunded. "}
            </span>
          )}
          {receipt.status === "refunded"
            ? "The full payment has been returned to the original buyer’s token account."
            : "This order is complete. The reserved portion has been released to the merchant and this order can no longer be refunded."}
        </p>
      ) : (
        <>
          <h3 className="text-base font-medium">
            {disputed
              ? "Dispute awaiting review"
              : link.refundRequest
                ? "Refund requested"
                : "Manage this order"}
          </h3>
          {disputed && (
            <span className="mt-3 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
              Disputed on-chain
            </span>
          )}
          {link.refundRequest && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-4 text-sm leading-6">
              <p>{refundReasonLabels[link.refundRequest.reason]}</p>
              <p className="text-xs text-muted-foreground">
                Requested{" "}
                {new Date(link.refundRequest.requestedAt).toLocaleString()} ·
                Awaiting resolver decision
              </p>
            </div>
          )}
          <p className="my-3 text-xs leading-6 text-muted-foreground">
            {disputed
              ? "Only the resolver can refund or complete this order, including after protection ends. A dispute does not guarantee a refund."
              : expired
                ? "The protection period has ended. This undisputed order can be completed and cannot be disputed."
                : onchainDisputes
                  ? "First approve an on-chain dispute, then sign a public reason. A confirmed dispute prevents release until the resolver decides."
                  : "Refund requests are currently recorded off-chain. A request does not extend protection or prevent completion. The resolver must approve a refund before completion."}
          </p>
          {!active && (
            <p className="my-3 text-sm text-muted-foreground">
              Connect the buyer, merchant, or resolver wallet to manage this
              order.
            </p>
          )}
          {canRequest &&
            (!active?.wallet.signMessage ||
              (onchainDisputes &&
                !disputed &&
                !active?.wallet.signTransaction)) && (
              <p className="my-3 text-xs text-muted-foreground">
                Use a wallet with message and devnet transaction signing to
                request a refund.
              </p>
            )}
          {canComplete && !active?.wallet.signTransaction && (
            <p className="my-3 text-xs text-muted-foreground">
              Switch to a wallet with devnet transaction signing to resolve this
              order.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {canRequest && (
              <Button
                variant="outline"
                disabled={
                  disabled ||
                  !active?.wallet.signMessage ||
                  (onchainDisputes &&
                    !disputed &&
                    !active?.wallet.signTransaction)
                }
                onClick={() => {
                  setError("");
                  setDialog("request");
                }}
              >
                {requestLabel}
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
            {canComplete && (
              <Button
                variant="brand"
                disabled={disabled || !active?.wallet.signTransaction}
                onClick={() => {
                  setError("");
                  setDialog("complete");
                }}
              >
                {isResolver && link.refundRequest
                  ? "Reject refund & complete"
                  : "Complete order"}
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
              {pending.action === "dispute"
                ? "dispute"
                : pending.action === "refund"
                  ? "refund"
                  : "completion"}
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
                ? disputed
                  ? "Your dispute is active on-chain. Sign a message to add a public reason; no second dispute transaction is needed. The resolver decides whether to refund."
                  : onchainDisputes
                    ? "Step 1: approve the dispute transaction (a devnet SOL fee applies). Step 2: after confirmation, choose Add refund reason and sign your public reason. Only the resolver can then release or refund this order."
                    : "Sign a public reason. This off-chain request does not prevent completion or guarantee a refund."
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
                ? onchainDisputes && !disputed
                  ? "Approve dispute in wallet"
                  : "Sign refund reason"
                : "Review in wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
