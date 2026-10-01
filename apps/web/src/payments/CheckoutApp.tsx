import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { PublicKey } from "@solana/web3.js";
import {
  ArrowUpRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { WalletControl, type WalletConnection } from "../lib/WalletControl";
import { useToast } from "../lib/Toast";
import { connection, exactAmount, explorer } from "../merchant/client";
import {
  transactionResult,
  validateSignedTransaction,
} from "../merchant/transactions";
import { paymentClient } from "./chain";
import {
  PaymentBoundary,
  usePaymentsReady,
  paymentsConfigured,
} from "./PaymentProvider";
import { protectionLabel } from "./terms";
import {
  loadPayment,
  savePayment,
  clearPayment,
  type PendingPayment,
} from "./pending";

export function CheckoutApp() {
  const ready = usePaymentsReady();
  const [id, setId] = useState<string | null>(null);
  const [active, setActive] = useState<WalletConnection | null>(null);
  const [locked, setLocked] = useState(false);
  const currentWallet = useRef(active);
  const onChange = useCallback((next: WalletConnection | null) => {
    currentWallet.current = next;
    setActive(next);
  }, []);
  const isCurrent = (wallet: WalletConnection) =>
    currentWallet.current?.account.address === wallet.account.address &&
    currentWallet.current?.wallet.identity === wallet.wallet.identity;
  useEffect(() => {
    setId(location.pathname.split("/")[2] ?? "");
  }, []);
  return (
    <div className="merchant-shell checkout-shell">
      <a className="skip-link" href="#checkout-main">
        Skip to payment
      </a>
      <header className="merchant-header">
        <a className="brand" href="/" aria-label="ReservePay home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          ReservePay<span className="brand-period">.</span>
        </a>
        <div className="merchant-header-actions">
          <span className="network-badge">
            <span />
            Devnet
          </span>
          <WalletControl onChange={onChange} locked={locked} />
        </div>
      </header>
      <main id="checkout-main" className="checkout-main" tabIndex={-1}>
        <div className="checkout-heading">
          <span className="merchant-eyebrow">RESERVEPAY / CHECKOUT</span>
          <h1>
            A little more <em>peace of mind.</em>
          </h1>
          <p>A direct payment, backed by the merchant’s reserve.</p>
        </div>
        <div className="devnet-notice">
          <ShieldCheck size={18} />
          <p>
            <strong>Devnet test payment.</strong> Use test USDC and a little
            devnet SOL for fees. These tokens have no monetary value.
          </p>
        </div>
        <PaymentBoundary>
          {ready && id !== null ? (
            <Checkout
              id={id}
              active={active}
              setLocked={setLocked}
              isCurrent={isCurrent}
            />
          ) : (
            <section className="reserve-card checkout-card" role="status">
              {paymentsConfigured ? (
                <>
                  <LoaderCircle size={24} className="pending-spinner" /> Loading
                  payment details…
                </>
              ) : (
                "Payment service is not configured for this deployment."
              )}
            </section>
          )}
        </PaymentBoundary>
        <footer className="merchant-footer">
          <span>
            <span className="status-dot" />
            On-chain payments · Solana devnet
          </span>
          <a href="/app">
            Merchant dashboard <ArrowUpRight size={12} />
          </a>
        </footer>
      </main>
    </div>
  );
}
function Checkout({
  id,
  active,
  setLocked,
  isCurrent,
}: {
  id: string;
  active: WalletConnection | null;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
}) {
  const link = useQuery(api.payments.get, { id });
  const sync = useAction(api.paymentActions.sync);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [journalError, setJournalError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const { notify } = useToast();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const read = () => {
      try {
        setPending(loadPayment(id));
        setJournalError("");
      } catch (error) {
        setJournalError(
          error instanceof Error
            ? error.message
            : "Saved payment could not be read.",
        );
      }
      setLoaded(true);
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [id]);
  useEffect(() => {
    if (!link || (link.receipt && link.receipt.status !== "paid")) return;
    let stopped = false,
      running = false;
    const check = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const verified = await sync({ id });
        if (stopped) return;
        if (verified) {
          clearPayment(id);
          setPending(null);
          setError("");
          setMessage("");
        } else if (pending) {
          const result = await transactionResult(connection, pending);
          if (stopped) return;
          if (result === "failed" || result === "expired") {
            clearPayment(id);
            setPending(null);
            setError(
              result === "failed"
                ? "The transaction failed. No payment was made by this transaction."
                : "The transaction expired without confirmation. You can try again.",
            );
          } else
            setMessage(
              result === "confirmed"
                ? "Confirmed on Solana. Verifying the finalized order…"
                : "Waiting for Solana confirmation. You can safely reload this page.",
            );
        }
      } catch {
        if (!stopped)
          setMessage(
            "Order verification is temporarily unavailable. We’ll keep checking; do not send another payment while one is pending.",
          );
      } finally {
        running = false;
      }
    };
    void check();
    const timer = window.setInterval(check, link.receipt ? 30_000 : 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, Boolean(link), link?.receipt?.status, pending, sync]);
  useEffect(() => {
    if (!link?.receipt) return;
    try {
      clearPayment(id);
      setPending(null);
    } catch {}
  }, [id, link?.receipt]);
  const pay = async () => {
    if (
      !link ||
      link.receipt ||
      !active?.wallet.signTransaction ||
      pending ||
      !loaded ||
      journalError ||
      inFlight.current
    )
      return;
    const wallet = active;
    const execute = async () => {
      const saved = loadPayment(id);
      if (saved) {
        setPending(saved);
        throw new Error("This payment is already awaiting confirmation.");
      }
      const prepared = await paymentClient(connection).prepare(
        link,
        new PublicKey(wallet.account.address),
      );
      if (!isCurrent(wallet))
        throw new Error("Wallet changed. Nothing was submitted.");
      setBusy("Approve payment in your wallet…");
      const bytes = await wallet.wallet.signTransaction!(
        wallet.account.address,
        new Uint8Array(
          prepared.transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
        ),
      );
      if (!isCurrent(wallet))
        throw new Error("Wallet changed. Nothing was submitted.");
      const signed = validateSignedTransaction(prepared.transaction, bytes);
      const record = {
        signature: signed.signature,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        buyer: wallet.account.address,
      };
      // Persist before broadcast. If storage is unavailable, no transaction is sent.
      savePayment(id, record);
      setPending(record);
      setBusy("Sending to Solana…");
      try {
        await connection.sendRawTransaction(signed.bytes, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      } catch {
        setMessage(
          "Submission is uncertain. We’ll verify this transaction before allowing a retry.",
        );
      }
    };
    inFlight.current = true;
    setLocked(true);
    setBusy("Checking balance and reserve…");
    setError("");
    setMessage("");
    try {
      if (navigator.locks)
        await navigator.locks.request(
          `reservepay:checkout:${id}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error("This payment is being prepared in another tab.");
            await execute();
          },
        );
      else await execute();
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : "Payment could not be prepared.";
      if (mounted.current) {
        setError(description);
        notify({
          title: "Payment needs attention",
          description,
          tone: "error",
        });
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy("");
        setLocked(false);
      }
    }
  };
  if (link === undefined)
    return (
      <section className="reserve-card checkout-card" role="status">
        Loading payment details…
      </section>
    );
  if (!link)
    return (
      <section className="reserve-card checkout-card">
        <h2>Payment link not found.</h2>
        <p>Check the URL or ask the merchant for their payment link.</p>
      </section>
    );
  if (link.receipt)
    return <Receipt link={link} buyer={active?.account.address} />;
  return (
    <section className="reserve-card checkout-card" aria-busy={Boolean(busy)}>
      <span className="merchant-eyebrow">PAYMENT FOR</span>
      <h2>{link.title}</h2>
      <div className="checkout-amount">
        {exactAmount(BigInt(link.amount))}
        <span>USDC</span>
      </div>
      <dl className="checkout-details">
        <div>
          <dt>Network</dt>
          <dd>Solana devnet</dd>
        </div>
        <div>
          <dt>Payment protection</dt>
          <dd>{protectionLabel(link.protectionSeconds)}</dd>
        </div>
        <div>
          <dt>Merchant wallet</dt>
          <dd>
            <a
              className="payment-address"
              href={explorer(link.merchant)}
              target="_blank"
              rel="noreferrer"
            >
              {link.merchant}
              <ArrowUpRight size={12} />
            </a>
          </dd>
        </div>
      </dl>
      <div className="checkout-protection">
        <ShieldCheck size={20} />
        <p>
          The merchant’s reserve backs the full payment during your protection
          period. Refunds require an authorized resolver; self-service refund
          requests are not available yet.
        </p>
      </div>
      {!active && (
        <p className="payment-empty">Connect your wallet above to continue.</p>
      )}
      {active && !active.wallet.signTransaction && (
        <p className="payment-error">
          This wallet does not support devnet transaction signing. Switch
          wallets to continue.
        </p>
      )}
      {active?.account.address === link.merchant && (
        <p className="payment-fineprint">
          You’re viewing your own link. Share it with a buyer using another
          wallet.
        </p>
      )}
      <button
        className="button button-green checkout-pay"
        disabled={
          !active?.wallet.signTransaction ||
          active?.account.address === link.merchant ||
          Boolean(busy || pending || journalError) ||
          !loaded
        }
        onClick={() => void pay()}
      >
        {busy || pending ? (
          <LoaderCircle size={17} className="pending-spinner" />
        ) : (
          <LockKeyhole size={16} />
        )}
        {busy ||
          (pending
            ? "Payment in progress…"
            : `Pay ${exactAmount(BigInt(link.amount))} USDC`)}
      </button>
      <p className="payment-fineprint">
        A network fee and account rent in devnet SOL are shown in your wallet.
        Each link accepts one payment.
      </p>
      {(error || journalError) && (
        <p role="alert" className="payment-error">
          {error || journalError}
        </p>
      )}
      {message && (
        <p className="payment-fineprint" role="status">
          {message}
        </p>
      )}
      {pending && (
        <a
          className="payment-order-link"
          href={explorer(pending.signature, "tx")}
          target="_blank"
          rel="noreferrer"
        >
          View pending transaction <ArrowUpRight size={13} />
        </a>
      )}
    </section>
  );
}
function Receipt({
  link,
  buyer,
}: {
  link: Doc<"paymentLinks">;
  buyer?: string;
}) {
  const receipt = link.receipt!;
  return (
    <section className="reserve-card checkout-card checkout-receipt">
      <span className="receipt-check">
        <Check size={28} />
      </span>
      <span className="merchant-eyebrow">VERIFIED ON SOLANA DEVNET</span>
      <h2>
        {receipt.status === "refunded"
          ? "Payment refunded."
          : "Payment received."}
      </h2>
      <p>{link.title}</p>
      <div className="checkout-amount">
        {exactAmount(BigInt(link.amount))}
        <span>USDC</span>
      </div>
      {buyer && buyer !== receipt.buyer && (
        <p className="payment-fineprint">
          This link was paid by a different wallet.
        </p>
      )}
      <dl className="checkout-details">
        <div>
          <dt>Status</dt>
          <dd>{receipt.status === "paid" ? "Paid" : receipt.status}</dd>
        </div>
        <div>
          <dt>Received by merchant</dt>
          <dd>
            {exactAmount(BigInt(link.amount) - BigInt(receipt.reserveAmount))}{" "}
            USDC at checkout
          </dd>
        </div>
        <div>
          <dt>Added to reserve</dt>
          <dd>{exactAmount(BigInt(receipt.reserveAmount))} USDC at checkout</dd>
        </div>
        <div>
          <dt>Protection deadline</dt>
          <dd>{new Date(receipt.expiresAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Buyer wallet</dt>
          <dd className="payment-address">{receipt.buyer}</dd>
        </div>
      </dl>
      <a
        className="button button-green checkout-pay"
        href={explorer(receipt.order)}
        target="_blank"
        rel="noreferrer"
      >
        View on-chain order <ArrowUpRight size={16} />
      </a>
      <p className="payment-fineprint">
        Keep this URL as your receipt. The merchant can see the same confirmed
        order in their dashboard.
      </p>
    </section>
  );
}
