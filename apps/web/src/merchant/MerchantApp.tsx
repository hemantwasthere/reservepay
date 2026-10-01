import { KeyboardShortcuts } from "../lib/KeyboardShortcuts";
import { useToast } from "../lib/Toast";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleHelp,
  ExternalLink,
  ChartNoAxesCombined,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { formatUsdc, reservePosition } from "@reservepay/core/settlement";
import { WalletControl, type WalletConnection } from "../lib/WalletControl";
import {
  client,
  connection,
  DEVNET_USDC,
  exactAmount,
  explorer,
  parseAmount,
  PROGRAM_ID,
  type MerchantState,
  type ReserveAction,
} from "./client";
import {
  clearPending,
  loadPending,
  savePending,
  transactionResult,
  validateSignedTransaction,
  type PendingTransaction,
} from "./transactions";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-6)}`;
const labels: Record<ReserveAction, string> = {
  register: "Merchant registration",
  fund: "Reserve deposit",
  withdraw: "Reserve withdrawal",
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Refresh and try again.";

export function MerchantApp() {
  const [active, setActive] = useState<WalletConnection | null>(null);
  const [locked, setLocked] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);
  const activeRef = useRef(active);
  const onChange = useCallback((next: WalletConnection | null) => {
    activeRef.current = next;
    setActive(next);
    setLocked(false);
  }, []);
  const isCurrent = useCallback(
    (value: WalletConnection) =>
      activeRef.current?.account.address === value.account.address &&
      activeRef.current?.wallet.identity === value.wallet.identity,
    [],
  );
  return (
    <div className="merchant-shell">
      <a className="skip-link" href="#merchant-main">
        Skip to dashboard
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
        <span className="workspace-label">MERCHANT WORKSPACE</span>
        <div className="merchant-header-actions">
          <span className="network-badge">
            <span /> Devnet
          </span>
          <WalletControl
            onChange={onChange}
            onLoadingChange={setWalletLoading}
            locked={locked}
          />
        </div>
      </header>
      <div className="merchant-layout">
        <aside className="merchant-sidebar" aria-label="Workspace navigation">
          <span className="merchant-eyebrow">YOUR WORKSPACE</span>
          <a href="/app" className="sidebar-active" aria-current="page">
            <ChartNoAxesCombined size={17} aria-hidden="true" /> Overview
          </a>
          <div className="sidebar-note">
            <ShieldCheck size={22} />
            <strong>
              A little reserve.
              <br />A lot of trust.
            </strong>
            <p>
              Collateral stays in your on-chain reserve, ready to protect your
              customers.
            </p>
          </div>
          <a className="sidebar-help" href="/#faq-title">
            <CircleHelp size={15} /> How ReservePay works{" "}
            <ArrowUpRight size={13} />
          </a>
        </aside>
        <main id="merchant-main" className="merchant-main" tabIndex={-1}>
          <div className="merchant-page-heading">
            <div>
              <div className="merchant-eyebrow">RESERVE / OVERVIEW</div>
              <h1>
                Your reserve, <em>in balance.</em>
              </h1>
              <p>The foundation for protected payments. Yours to manage.</p>
            </div>
            <span className="pilot-tag">DEVNET PREVIEW</span>
          </div>
          <div className="devnet-notice">
            <span className="notice-icon">
              <CircleHelp size={15} />
            </span>
            <p>
              This workspace uses <strong>test USDC on Solana devnet</strong>.
              Tokens have no monetary value. Each action asks for your wallet’s
              approval.
            </p>
          </div>
          <MerchantWorkspace
            key={active?.account.address ?? "disconnected"}
            active={active}
            walletLoading={walletLoading}
            isCurrent={isCurrent}
            setLocked={setLocked}
          />
          <footer className="merchant-footer">
            <KeyboardShortcuts dashboard />
            <span>
              <span className="status-dot" /> Built on Solana · Devnet only
            </span>
            <a
              href={explorer(PROGRAM_ID.toBase58())}
              target="_blank"
              rel="noreferrer"
            >
              View program <ExternalLink size={12} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function MerchantWorkspace({
  active,
  walletLoading,
  isCurrent,
  setLocked,
}: {
  active: WalletConnection | null;
  walletLoading: boolean;
  isCurrent: (value: WalletConnection) => boolean;
  setLocked: (locked: boolean) => void;
}) {
  const { notify, dismiss } = useToast();
  const [state, setState] = useState<MerchantState | null>(null);
  const [readError, setReadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"fund" | "withdraw">("fund");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [receipt, setReceipt] = useState<{
    transaction: PendingTransaction;
    result: string;
  } | null>(null);
  const [journalError, setJournalError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const refreshInFlight = useRef(false);
  const actionInFlight = useRef(false);
  const mounted = useRef(true);
  const current = () => mounted.current && Boolean(active && isCurrent(active));

  const refresh = useCallback(
    async (manual = false) => {
      if (!active || refreshInFlight.current) return;
      refreshInFlight.current = true;
      setRefreshing(true);
      if (manual)
        notify({
          id: "balance-refresh",
          title: "Refreshing balances",
          description: "Reading confirmed balances from Solana devnet.",
          tone: "loading",
        });
      try {
        const next = await client.read(new PublicKey(active.account.address));
        if (mounted.current && isCurrent(active)) {
          setState(next);
          setReadError("");
          if (manual)
            notify({
              id: "balance-refresh",
              title: "Balances updated",
              description: "Your reserve is up to date.",
              tone: "success",
            });
        }
      } catch (error) {
        if (mounted.current && isCurrent(active)) {
          setReadError(`Could not refresh balances. ${errorMessage(error)}`);
          if (manual)
            notify({
              id: "balance-refresh",
              title: "Could not refresh balances",
              description: errorMessage(error),
              tone: "error",
            });
        }
      } finally {
        refreshInFlight.current = false;
        if (mounted.current) setRefreshing(false);
      }
    },
    [active, isCurrent, notify],
  );

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const readJournal = () => {
      try {
        setPending(loadPending(active.account.address));
        setJournalError("");
      } catch (error) {
        setJournalError(errorMessage(error));
      }
      setLoaded(true);
    };
    readJournal();
    window.addEventListener("storage", readJournal);
    return () => window.removeEventListener("storage", readJournal);
  }, [active]);

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const result = await transactionResult(connection, pending);
        if (stopped || !current()) return;
        if (result !== "pending") {
          clearPending(pending);
          setReceipt({ transaction: pending, result });
          setPending(null);
          setMessage(
            result === "confirmed"
              ? `${labels[pending.action]} confirmed on devnet.`
              : result === "expired"
                ? "The transaction expired without confirmation. Refresh your balances before trying again."
                : "The transaction failed on-chain. No reserve transfer was completed.",
          );
          if (result === "confirmed") setAmount("");
          void refresh();
        }
      } catch {
        if (!stopped)
          setMessage(
            "Confirmation is taking longer than expected. We’ll keep checking this transaction; do not submit it again.",
          );
      } finally {
        running = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 6000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, refresh]);

  useEffect(() => {
    if (!active || !(busy || pending || message)) return;
    notify({
      id: `transaction:${active.account.address}`,
      title: busy
        ? "Transaction in progress"
        : pending
          ? `${labels[pending.action]} pending`
          : receipt?.result === "confirmed"
            ? `${labels[receipt.transaction.action]} complete`
            : "Transaction needs attention",
      description:
        busy || message || "Waiting for confirmation on Solana devnet.",
      tone:
        busy || pending
          ? "loading"
          : receipt?.result === "confirmed"
            ? "success"
            : "error",
      href:
        pending || receipt
          ? explorer((pending ?? receipt!.transaction).signature, "tx")
          : undefined,
    });
  }, [active, busy, pending, message, receipt, notify]);

  useEffect(
    () => () => {
      if (active) dismiss(`transaction:${active.account.address}`);
      dismiss("balance-refresh");
    },
    [active, dismiss],
  );

  const loading = Boolean(walletLoading || (active && !state && !readError));
  const position = state ? reservePosition(state.reserve, state.locked) : null;
  const maxAmount =
    action === "fund"
      ? (state?.walletBalance ?? 0n)
      : (position?.available ?? 0n);
  let parsed = 0n;
  try {
    parsed = parseAmount(amount);
  } catch {}
  const amountValid = parsed > 0n && parsed <= maxAmount;
  const enabled = Boolean(
    active?.wallet.signTransaction &&
      state?.ready &&
      !readError &&
      !busy &&
      !pending &&
      !journalError &&
      loaded,
  );

  const submit = async (requested: ReserveAction) => {
    if (!active || !enabled || actionInFlight.current) return;
    const wallet = active;
    const execute = async () => {
      const previous = loadPending(wallet.account.address);
      if (previous) {
        setPending(previous);
        throw new Error(
          "An earlier transaction is still awaiting confirmation.",
        );
      }
      const units = requested === "register" ? 0n : parseAmount(amount);
      const prepared = await client.prepare(
        new PublicKey(wallet.account.address),
        requested,
        units,
      );
      if (!current()) throw new Error("Wallet changed. Nothing was submitted.");
      setBusy("Approve in your wallet…");
      const bytes = await wallet.wallet.signTransaction!(
        wallet.account.address,
        new Uint8Array(
          prepared.transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }),
        ),
      );
      if (!current()) throw new Error("Wallet changed. Nothing was submitted.");
      const signed = validateSignedTransaction(prepared.transaction, bytes);
      const record: PendingTransaction = {
        signature: signed.signature,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        action: requested,
        amount: units.toString(),
        address: wallet.account.address,
        createdAt: Date.now(),
      };
      savePending(record);
      setPending(record);
      setBusy("Submitting to devnet…");
      setMessage("Signed. Waiting for confirmation on Solana devnet.");
      try {
        await connection.sendRawTransaction(signed.bytes, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      } catch {
        if (current())
          setMessage(
            "Submission could not be confirmed yet. We’ll check the transaction before allowing another transfer.",
          );
      }
    };
    actionInFlight.current = true;
    setLocked(true);
    setBusy("Preparing transaction…");
    setMessage("");
    setReceipt(null);
    try {
      if (navigator.locks)
        await navigator.locks.request(
          `reservepay:${wallet.account.address}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error(
                "A transaction is already being prepared in another tab.",
              );
            await execute();
          },
        );
      else await execute();
    } catch (error) {
      if (current()) setMessage(errorMessage(error));
    } finally {
      actionInFlight.current = false;
      if (current()) {
        setBusy("");
        setLocked(false);
      }
    }
  };

  return (
    <>
      <div className="reserve-heading">
        <span className="merchant-eyebrow">RESERVE POSITION</span>
        <button
          className="text-button"
          onClick={() => void refresh(true)}
          data-shortcut="refresh"
          aria-keyshortcuts="Alt+Shift+R"
          aria-busy={refreshing}
          disabled={!active || refreshing || Boolean(busy)}
        >
          <RefreshCw
            size={13}
            className={refreshing ? "pending-spinner" : ""}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div
        className="reserve-stats"
        aria-busy={loading}
        aria-label="Reserve balances"
      >
        <Stat
          icon={<ShieldCheck size={17} />}
          loading={loading}
          tone="info"
          label="Total reserve"
          amount={state?.reserve}
          note="Held in your reserve vault"
        />
        <Stat
          icon={<LockKeyhole size={17} />}
          loading={loading}
          tone="warning"
          label="Backing open orders"
          amount={state?.locked}
          note="Protected until orders resolve"
        />
        <Stat
          icon={<ArrowUpRight size={17} />}
          loading={loading}
          label="Available to withdraw"
          amount={position?.available}
          note="Collateral you can move freely"
          accent
        />
      </div>
      {readError && (
        <div className="merchant-alert" role="alert">
          {readError} Displayed balances may be out of date; transfers are
          paused.
        </div>
      )}
      {journalError && (
        <div className="merchant-alert" role="alert">
          {journalError}
        </div>
      )}
      {active && state && !state.ready && (
        <div className="merchant-alert" role="status">
          The devnet program is awaiting deployment or initialization. Wallet
          balances are live; merchant transactions will unlock when it is ready.
        </div>
      )}
      {active && !active.wallet.signTransaction && (
        <div className="merchant-alert" role="alert">
          This wallet does not support the required transaction signing. Connect
          a compatible Solana wallet such as Phantom.
        </div>
      )}
      <div className="merchant-content-grid">
        <section className="reserve-card">
          <div className="reserve-card-heading">
            <div>
              <span className="merchant-eyebrow">GETTING STARTED</span>
              <h2>
                {loading
                  ? "Loading your reserve…"
                  : state?.registered
                    ? "A reserve you control."
                    : "Your first protected payment starts here."}
              </h2>
            </div>
            <ShieldCheck size={23} />
          </div>
          <div className="onboarding-steps">
            <SetupStep
              number="01"
              done={Boolean(active)}
              active={!active}
              title="Connect your wallet"
              description={
                active
                  ? `${short(active.account.address)} · Your merchant authority`
                  : "Use a Solana wallet to manage your reserve."
              }
            />
            <SetupStep
              number="02"
              done={Boolean(state?.registered)}
              active={Boolean(active && !state?.registered)}
              title="Register your merchant"
              description="Create your merchant account and its reserve vault on Solana."
            />
            <SetupStep
              number="03"
              done={Boolean(state && state.reserve > 0n)}
              active={Boolean(state?.registered && state.reserve === 0n)}
              title="Add your first collateral"
              description="Deposit test USDC to back future protected orders."
            />
          </div>
          {walletLoading ? (
            <div className="setup-footer" role="status">
              <LoaderCircle
                size={16}
                className="pending-spinner"
                aria-hidden="true"
              />
              <span>Checking your wallet connection…</span>
            </div>
          ) : !active ? (
            <div className="setup-footer">
              <Wallet size={16} />
              <span>Connect your wallet in the top right to begin.</span>
            </div>
          ) : !state?.registered ? (
            <div className="setup-footer">
              <button
                className="button button-green"
                disabled={!enabled || !state}
                onClick={() => void submit("register")}
              >
                {busy || pending || loading ? (
                  <LoaderCircle size={15} className="pending-spinner" />
                ) : (
                  <ArrowUpRight size={15} />
                )}
                {busy ||
                  (pending
                    ? "Confirming registration…"
                    : loading
                      ? "Loading merchant…"
                      : "Register merchant")}
              </button>
              <span>One-time setup · Devnet SOL rent applies</span>
            </div>
          ) : (
            <div className="setup-footer">
              <CheckCheck size={17} />
              <span>
                Merchant registered. Your wallet authorizes every reserve
                movement.
              </span>
            </div>
          )}
        </section>
        <section className="reserve-card transfer-card">
          <div className="reserve-card-heading">
            <div>
              <span className="merchant-eyebrow">MOVE COLLATERAL</span>
              <h2>Manage your reserve</h2>
            </div>
            <ArrowDownLeft size={21} />
          </div>
          <div
            className="transfer-tabs"
            role="group"
            aria-label="Reserve action"
          >
            <button
              aria-pressed={action === "fund"}
              onClick={() => {
                setAction("fund");
                setAmount("");
              }}
              disabled={Boolean(busy || pending)}
            >
              Add funds
            </button>
            <button
              aria-pressed={action === "withdraw"}
              onClick={() => {
                setAction("withdraw");
                setAmount("");
              }}
              disabled={Boolean(busy || pending)}
            >
              Withdraw
            </button>
          </div>
          <form
            aria-busy={Boolean(busy || pending)}
            onSubmit={(event) => {
              event.preventDefault();
              if (amountValid) void submit(action);
            }}
          >
            <label htmlFor="reserve-amount">
              Amount <span>DEVNET USDC</span>
            </label>
            <div className="reserve-amount">
              <input
                id="reserve-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!state?.registered || Boolean(busy || pending)}
                aria-describedby="amount-help"
                aria-invalid={Boolean(amount && !amountValid)}
                aria-keyshortcuts="Alt+Shift+A"
              />
              <button
                type="button"
                onClick={() => setAmount(exactAmount(maxAmount))}
                disabled={
                  !state?.registered ||
                  maxAmount === 0n ||
                  Boolean(busy || pending)
                }
              >
                Max
              </button>
            </div>
            <div className="amount-balance">
              <span>
                {action === "fund" ? "In your wallet" : "Available to withdraw"}
              </span>
              <strong title={exactAmount(maxAmount)}>
                {state ? `${exactAmount(maxAmount)} USDC` : "—"}
              </strong>
            </div>
            <p
              id="amount-help"
              className={`transfer-help ${amount && !amountValid ? "amount-error" : ""}`}
            >
              {amount && !amountValid
                ? parsed > maxAmount
                  ? "Amount exceeds your available balance."
                  : "Enter a positive amount with up to 6 decimals."
                : action === "fund"
                  ? "Funds go directly into your merchant’s reserve vault."
                  : "Funds return to this wallet. Collateral backing open orders stays locked."}
            </p>
            <button
              className="button button-dark transfer-submit"
              disabled={!enabled || !state?.registered || !amountValid}
            >
              {busy || pending ? (
                <LoaderCircle size={15} className="pending-spinner" />
              ) : action === "fund" ? (
                <ArrowDownLeft size={15} />
              ) : (
                <ArrowUpRight size={15} />
              )}
              {busy ||
                (pending ? "Confirming transaction…" : undefined) ||
                (action === "fund" ? "Add to reserve" : "Withdraw to wallet")}
            </button>
          </form>
          <div className="transfer-security">
            <LockKeyhole size={12} /> Approved by you. Enforced on-chain.
          </div>
        </section>
      </div>
      {(pending || message) && (
        <div
          className={`transaction-notice ${receipt?.result === "confirmed" ? "transaction-confirmed" : ""}`}
        >
          <div>
            {pending ? (
              <LoaderCircle size={17} className="pending-spinner" />
            ) : receipt?.result === "confirmed" ? (
              <Check size={17} />
            ) : (
              <CircleHelp size={17} />
            )}
            <p>
              {pending
                ? `${labels[pending.action]} awaiting confirmation. ${message}`
                : message}
            </p>
          </div>
          {(pending || receipt) && (
            <a
              href={explorer((pending ?? receipt!.transaction).signature, "tx")}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
      <div className="merchant-bottom-grid">
        <section className="reserve-card reserve-breakdown">
          <div className="reserve-card-heading">
            <div>
              <span className="merchant-eyebrow">HOW YOUR RESERVE WORKS</span>
              <h2>Room for peace of mind.</h2>
            </div>
            <span className="rate-badge">
              {state ? `${state.reserveBps / 100}%` : "5%"} reserve rate
            </span>
          </div>
          <div
            role="img"
            className="reserve-allocation"
            aria-label={
              state
                ? `${exactAmount(state.locked)} USDC locked, ${exactAmount(position!.available)} USDC available`
                : "Connect a wallet to see your reserve allocation"
            }
          >
            <span
              style={{
                width: `${state && state.reserve > 0n ? Math.min(100, Number((state.locked * 10000n) / state.reserve) / 100) : 0}%`,
              }}
            />
          </div>
          <div className="allocation-legend">
            <span>
              <i /> Backing open orders
            </span>
            <span>
              <i /> Available collateral
            </span>
          </div>
          <p>
            {state?.registered
              ? "Each protected order locks enough collateral for a full refund. Only the surplus can be withdrawn."
              : "Your reserve covers open orders in full. Connect and register to see your own allocation here."}
          </p>
          {state?.registered && (
            <div className="merchant-chain-links">
              <a
                href={explorer(state.merchant)}
                target="_blank"
                rel="noreferrer"
              >
                Merchant account <ExternalLink size={12} />
              </a>
              <a href={explorer(state.vault)} target="_blank" rel="noreferrer">
                Reserve vault <ExternalLink size={12} />
              </a>
            </div>
          )}
        </section>
        <section className="reserve-card faucet-card">
          <span className="merchant-eyebrow">A LITTLE TEST FUEL</span>
          <h2>Ready to try it?</h2>
          <p>
            Switch your wallet to devnet. Get test SOL for fees and test USDC
            for your reserve.
          </p>
          <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">
            Get devnet SOL <ArrowUpRight size={15} />
          </a>
          <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
            Get test USDC <ArrowUpRight size={15} />
          </a>
          <div className="faucet-token">
            <a
              href={explorer(DEVNET_USDC.toBase58())}
              target="_blank"
              rel="noreferrer"
            >
              Circle devnet USDC <ExternalLink size={11} />
            </a>
            {state && (
              <span>Wallet: {(state.lamports / 1e9).toFixed(4)} SOL</span>
            )}
          </div>
        </section>
      </div>
      {state && (
        <p className="balance-timestamp">
          Confirmed at slot {state.slot.toLocaleString("en-US")} · Balances
          refresh every 20 seconds
        </p>
      )}
    </>
  );
}

function Stat({
  icon,
  label,
  amount,
  note,
  accent = false,
  loading = false,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  amount?: bigint;
  note: string;
  accent?: boolean;
  loading?: boolean;
  tone?: "info" | "warning";
}) {
  return (
    <section
      className={`reserve-stat ${accent ? "reserve-stat-accent" : ""} ${tone ? `reserve-stat-${tone}` : ""}`}
    >
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong
        title={amount === undefined ? undefined : `${exactAmount(amount)} USDC`}
      >
        {loading ? (
          <>
            <span className="balance-skeleton" aria-hidden="true" />
            <span className="sr-only">Loading balance</span>
          </>
        ) : amount === undefined ? (
          "—"
        ) : (
          formatUsdc(amount)
        )}
        <small>USDC</small>
      </strong>
      <p>{note}</p>
    </section>
  );
}

function SetupStep({
  number,
  done,
  active,
  title,
  description,
}: {
  number: string;
  done: boolean;
  active: boolean;
  title: string;
  description: string;
}) {
  return (
    <div
      className={`setup-step ${done ? "step-done" : active ? "step-active" : ""}`}
    >
      <span className="step-number">{done ? <Check size={15} /> : number}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {done && <span className="step-status">DONE</span>}
    </div>
  );
}
