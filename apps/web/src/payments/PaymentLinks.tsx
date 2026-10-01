import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  Link2,
  Copy,
  Check,
  ArrowUpRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import bs58 from "bs58";
import { api } from "../../convex/_generated/api";
import { type WalletConnection } from "../lib/WalletControl";
import { useToast } from "../lib/Toast";
import { exactAmount, parseAmount, explorer } from "../merchant/client";
import { paymentApproval, protectionLabel, type PaymentTerms } from "./terms";
import {
  PaymentBoundary,
  usePaymentsReady,
  paymentsConfigured,
} from "./PaymentProvider";

export function PaymentLinks(props: {
  active: WalletConnection | null;
  registered: boolean;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
  onPaid: () => void;
}) {
  const ready = usePaymentsReady();
  return (
    <section
      className="reserve-card payment-links"
      id="payment-links"
      aria-labelledby="payment-links-title"
    >
      <div className="reserve-card-heading">
        <div>
          <span className="merchant-eyebrow">PAYMENTS / DEVNET</span>
          <h2 id="payment-links-title">A link. A protected payment.</h2>
        </div>
        <Link2 size={22} aria-hidden="true" />
      </div>
      <p className="payment-intro">
        Create a single-use checkout for test USDC. Share it with your buyer and
        follow the order here.
      </p>
      {!props.active ? (
        <div className="payment-empty">
          Connect your wallet to manage payment links.
        </div>
      ) : !props.registered ? (
        <div className="payment-empty">
          Register your merchant account above to start accepting payments.
        </div>
      ) : !ready ? (
        <div className="payment-empty" role="status">
          {paymentsConfigured
            ? "Connecting to payment history…"
            : "Payment service is not configured for this deployment."}
        </div>
      ) : (
        <PaymentBoundary>
          <LinkManager {...props} active={props.active} />
        </PaymentBoundary>
      )}
    </section>
  );
}
function LinkManager({
  active,
  locked,
  setLocked,
  isCurrent,
  onPaid,
}: {
  active: WalletConnection;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
  onPaid: () => void;
}) {
  const links = useQuery(api.payments.list, {
    merchant: active.account.address,
  });
  const create = useAction(api.paymentActions.create);
  const sync = useAction(api.paymentActions.sync);
  const { notify } = useToast();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [protection, setProtection] = useState(86400);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  // Preserve an approved request if the network response is lost; retry is idempotent.
  const approval = useRef<{ terms: PaymentTerms; signature: string } | null>(
    null,
  );
  const createLink = async () => {
    if (inFlight.current || locked || !active.wallet.signMessage) return;
    inFlight.current = true;
    setLocked(true);
    setError("");
    try {
      const units = parseAmount(amount).toString();
      let request = approval.current;
      if (
        !request ||
        request.terms.title !== title.trim() ||
        request.terms.amount !== units ||
        request.terms.protectionSeconds !== protection ||
        Date.now() - request.terms.issuedAt > 540_000
      ) {
        const terms: PaymentTerms = {
          merchant: active.account.address,
          reference: Array.from(
            crypto.getRandomValues(new Uint8Array(16)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join(""),
          title: title.trim(),
          amount: units,
          protectionSeconds: protection,
          issuedAt: Date.now(),
        };
        const message = paymentApproval(terms);
        setBusy("Approve link in your wallet…");
        const signature = bs58.encode(
          await active.wallet.signMessage(active.account.address, message),
        );
        if (!isCurrent(active))
          throw new Error("Wallet changed. Please try again.");
        request = { terms, signature };
        approval.current = request;
      }
      setBusy("Creating payment link…");
      await create(request);
      if (!isCurrent(active)) return;
      approval.current = null;
      setTitle("");
      setAmount("");
    } catch (error) {
      if (isCurrent(active))
        setError(
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : error instanceof Error
              ? error.message
              : "Could not create your payment link.",
        );
    } finally {
      inFlight.current = false;
      if (isCurrent(active)) {
        setBusy("");
        setLocked(false);
      }
    }
  };
  const refresh = async () => {
    if (checking || !links) return;
    setChecking(true);
    setError("");
    try {
      for (const link of links.filter(
        (item) => !item.receipt || item.receipt.status === "paid",
      ))
        await sync({ id: link._id });
      onPaid();
    } catch {
      setError(
        "Could not check all orders. Your existing receipts are saved. Try refreshing again.",
      );
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      <form
        className="payment-link-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createLink();
        }}
        aria-busy={Boolean(busy)}
      >
        <label>
          Payment for
          <input
            required
            maxLength={100}
            value={title}
            disabled={Boolean(busy)}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Design consultation"
            autoComplete="off"
          />
        </label>
        <label>
          Amount · USDC
          <input
            required
            inputMode="decimal"
            value={amount}
            disabled={Boolean(busy)}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="10.00"
          />
        </label>
        <label>
          Protection period
          <select
            value={protection}
            disabled={Boolean(busy)}
            onChange={(event) => setProtection(Number(event.target.value))}
          >
            <option value={3600}>1 hour</option>
            <option value={86400}>1 day</option>
            <option value={604800}>7 days</option>
          </select>
        </label>
        <button
          className="button button-green"
          disabled={locked || Boolean(busy) || !active.wallet.signMessage}
          type="submit"
        >
          {busy ? (
            <LoaderCircle size={16} className="pending-spinner" />
          ) : (
            <Link2 size={16} />
          )}
          {busy || "Create payment link"}
        </button>
      </form>
      <p className="payment-fineprint">
        Your wallet signs the link details. No funds move. Titles and on-chain
        receipts are public; keep personal information out.
      </p>
      {!active.wallet.signMessage && (
        <p className="payment-error">
          This wallet does not support message approval. Switch to a wallet such
          as Phantom to create links.
        </p>
      )}
      {error && (
        <p role="alert" className="payment-error">
          {error}
        </p>
      )}
      <div className="payment-history-heading">
        <h3>
          Recent payment links <span>{links?.length ?? ""}</span>
        </h3>
        <button
          className="payment-text-button"
          type="button"
          disabled={!links || checking}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} className={checking ? "pending-spinner" : ""} />
          {checking ? "Checking orders…" : "Refresh orders"}
        </button>
      </div>
      {links === undefined ? (
        <div className="payment-empty" role="status">
          Loading payment links…
        </div>
      ) : links.length === 0 ? (
        <div className="payment-empty">
          <Link2 size={24} />
          <strong>Your first payment starts here.</strong>
          <span>
            Create a link above, then share it with a buyer on devnet.
          </span>
        </div>
      ) : (
        <ul className="payment-link-list">
          {links.map((link) => (
            <li key={link._id}>
              <div className="payment-link-details">
                <a href={`/pay/${link._id}`}>
                  {link.title}
                  <ArrowUpRight size={14} />
                </a>
                <span>
                  {protectionLabel(link.protectionSeconds)} protection ·{" "}
                  {new Date(link._creationTime).toLocaleDateString()}
                </span>
                {link.receipt && (
                  <a
                    className="payment-order-link"
                    href={explorer(link.receipt.order)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on-chain order <ArrowUpRight size={12} />
                  </a>
                )}
              </div>
              <div className="payment-link-summary">
                <strong>
                  {exactAmount(BigInt(link.amount))} <small>USDC</small>
                </strong>
                <span
                  className={`link-payment-status ${link.receipt ? "link-payment-status-paid" : ""}`}
                >
                  {link.receipt?.status === "paid"
                    ? link.receipt.expiresAt > Date.now()
                      ? "Paid · protected"
                      : "Paid · period ended"
                    : (link.receipt?.status ?? "Awaiting payment")}
                </span>
              </div>
              <button
                className="payment-copy"
                aria-label={`Copy payment link for ${link.title}`}
                title="Copy payment link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${location.origin}/pay/${link._id}`,
                    );
                    setCopied(link._id);
                    setTimeout(
                      () =>
                        setCopied((value) => (value === link._id ? "" : value)),
                      2000,
                    );
                  } catch {
                    notify({
                      title: "Could not copy link",
                      description:
                        "Open the payment link and copy its URL from your browser.",
                      tone: "error",
                    });
                  }
                }}
              >
                {copied === link._id ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {links?.length === 50 && (
        <p className="payment-fineprint">Showing your 50 most recent links.</p>
      )}
    </>
  );
}
