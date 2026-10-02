import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  WorkspaceSidebar,
  WorkspaceSidebarTrigger,
  type WorkspacePage,
} from "./WorkspaceSidebar";
import { MerchantPayments } from "./MerchantPayments";
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

export function MerchantApp({ page = "overview" }: { page?: WorkspacePage }) {
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
    <SidebarProvider
      className="min-h-screen flex-col"
      style={
        {
          "--sidebar-width": "15rem",
          "--sidebar-width-icon": "4rem",
        } as React.CSSProperties
      }
    >
      <a
        className={
          "skip-link [clip-path:inset(50%)] fixed left-[16px] top-[-60px] z-[10] bg-foreground text-white p-[12px] [&:focus]:[clip-path:none] [&:focus]:top-[12px]"
        }
        href="#merchant-main"
      >
        Skip to dashboard
      </a>
      <header
        className={
          "merchant-header min-h-[88px] flex items-center gap-[34px] py-[20px] px-[34px] [border-bottom:1px_solid_var(--line)] bg-card max-[860px]:min-h-[78px] max-[860px]:py-[16px] max-[860px]:px-[24px] max-[640px]:px-3 max-[640px]:py-4 max-[640px]:gap-[8px] max-[640px]:[&_.brand]:text-[17px] max-[380px]:[&_.brand]:text-[14px] max-[380px]:px-2 max-[380px]:[&_.wallet-button]:px-2 max-[640px]:[&_.brand-mark]:w-[24px] max-[640px]:[&_.brand-mark]:h-[24px] max-[640px]:[&_.wallet-button]:min-h-[37px] max-[640px]:[&_.wallet-button]:text-[10px] max-[640px]:[&_.wallet-button]:gap-[6px] max-[640px]:[&_.wallet-button]:py-0 max-[640px]:[&_.wallet-button]:px-[10px] sticky top-0 z-30 h-[88px] shrink-0"
        }
      >
        <div className="flex shrink-0 items-center gap-4 max-[640px]:gap-2">
          <a
            className={
              "brand inline-flex items-center text-[22px] tracking-[-1px] font-[650] whitespace-nowrap max-[900px]:text-[20px] max-[700px]:text-[20px] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span]:[transform:skewY(-12deg)_scaleX(0.94)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span]:rounded-[1.5px] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span:first-child]:[transform:skewY(-12deg)_translateY(-1px)_scaleX(0.94)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span:last-child]:[transform:skewY(-12deg)_translateY(1px)_scaleX(0.94)] motion-reduce:[&:hover_.brand-mark_span]:[transform:skewY(-24deg)]"
            }
            href="/"
            aria-label="ReservePay home"
          >
            <span
              className={
                "brand-mark relative w-[25px] h-[28px] block mr-[10px] [&_span]:absolute [&_span]:left-[1px] [&_span]:w-[22px] [&_span]:h-[6px] [&_span]:bg-primary [&_span]:[transform:skewY(-24deg)] [&_span]:rounded-[1px] [&_span]:[transition:transform_420ms_var(--ease-settle),_border-radius_420ms_ease] [&_span:nth-child(1)]:top-[4px] [&_span:nth-child(2)]:top-[12px] [&_span:nth-child(3)]:top-[20px] max-[700px]:w-[22px] max-[700px]:mr-[7px] max-[700px]:[&_span]:w-[20px]"
              }
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </span>
            ReservePay<span className={"brand-period text-primary"}>.</span>
          </a>
          <WorkspaceSidebarTrigger />
        </div>
        <span
          className={
            "workspace-label [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground pl-[28px] [border-left:1px_solid_var(--line)] max-[1100px]:hidden"
          }
        >
          MERCHANT WORKSPACE
        </span>
        <div
          className={
            "merchant-header-actions ml-auto flex items-center gap-[23px] max-[640px]:gap-[10px]"
          }
        >
          <span
            className={
              "network-badge inline-flex gap-[7px] items-center [font:11px_var(--mono)] [color:var(--info)] [&>span]:w-[6px] [&>span]:h-[6px] [&>span]:rounded-[50%] [&>span]:bg-[#709155] [&>span]:[background:var(--info)] [&>span]:shadow-[0_0_0_3px_var(--info-soft)] max-[640px]:text-[9px] max-[640px]:gap-[4px] max-[640px]:hidden"
            }
          >
            <span /> Devnet
          </span>
          <WalletControl
            onChange={onChange}
            onLoadingChange={setWalletLoading}
            locked={locked}
          />
        </div>
      </header>
      <div className={"flex min-h-[calc(100svh-88px)]"}>
        <WorkspaceSidebar page={page} />
        <main
          id="merchant-main"
          className={
            "merchant-main min-w-[0] [padding:42px_clamp(24px,_3.5vw,_56px)_0] min-[1600px]:pt-[52px] max-[1100px]:[padding:30px_24px_0] max-[860px]:max-w-[800px] max-[860px]:my-0 max-[860px]:mx-auto max-[860px]:w-[100%] max-[640px]:[padding:27px_16px_0] motion-reduce:[&>*]:animate-[none] flex-1"
          }
          tabIndex={-1}
        >
          <div
            className={
              "merchant-page-heading flex items-center justify-between gap-[16px] mb-[28px] [&_h1]:text-[clamp(27px,_3vw,_39px)] [&_h1]:leading-[1.2] [&_h1]:tracking-[-1.4px] [&_h1]:[margin:14px_0_12px] [&_h1_em]:text-primary [&_p]:text-[12px] [&_p]:text-muted-foreground max-[640px]:[&_h1]:text-[30px] max-[640px]:[&_h1]:tracking-[-1px] max-[640px]:[&_p]:text-[11px]"
            }
          >
            <div>
              <div
                className={
                  "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
                }
              >
                {page === "payments"
                  ? "PAYMENTS / PAYMENT LINKS"
                  : "RESERVE / OVERVIEW"}
              </div>
              <h1>
                {page === "payments" ? (
                  <>
                    Your next payment, <em>one link away.</em>
                  </>
                ) : (
                  <>
                    Your reserve, <em>in balance.</em>
                  </>
                )}
              </h1>
              <p>
                {page === "payments"
                  ? "Create a checkout, share it, and follow every protected payment."
                  : "The foundation for protected payments. Yours to manage."}
              </p>
            </div>
            <span
              className={
                "pilot-tag py-[8px] px-[10px] [border:1px_dashed_#becbb2] [font:9px_var(--mono)] tracking-[1px] text-primary whitespace-nowrap max-[1100px]:hidden"
              }
            >
              DEVNET PREVIEW
            </span>
          </div>
          <div
            className={
              "devnet-notice flex gap-[10px] py-[13px] px-[16px] [border:1px_solid_#dce5d3] bg-[#edf2e7] rounded-[3px] mb-[29px] [background:var(--info-soft)] border-[#d5e0e7] [&_p]:text-[11px] [&_p]:text-[#626e57] [&_p]:leading-[1.6] [&_p]:[color:var(--info)] [&_strong]:font-[500] [&_strong]:text-[#3e5133] [&_strong]:[color:var(--info)] max-[640px]:p-[12px] max-[640px]:mb-[22px] max-[640px]:items-start"
            }
          >
            <span
              className={
                "notice-icon flex items-center text-[#7a8e6c] [color:var(--info)] max-[640px]:pt-[2px]"
              }
            >
              <CircleHelp size={15} />
            </span>
            <p>
              This workspace uses <strong>test USDC on Solana devnet</strong>.
              Tokens have no monetary value. Each action asks for your wallet’s
              approval.
            </p>
          </div>
          {page === "payments" ? (
            <MerchantPayments
              key={active?.account.address ?? "disconnected"}
              active={active}
              walletLoading={walletLoading}
              locked={locked}
              isCurrent={isCurrent}
              setLocked={setLocked}
            />
          ) : (
            <MerchantWorkspace
              key={active?.account.address ?? "disconnected"}
              active={active}
              walletLoading={walletLoading}
              isCurrent={isCurrent}
              setLocked={setLocked}
            />
          )}
          <footer
            className={
              "merchant-footer flex justify-between gap-[14px] py-[23px] px-0 [border-top:1px_solid_var(--line)] mt-[29px] [font:9px_var(--mono)] text-muted-foreground items-center flex-wrap [&_span]:inline-flex [&_span]:gap-[7px] [&_span]:items-center [&_a]:inline-flex [&_a]:gap-[7px] [&_a]:items-center max-[640px]:text-[8px] max-[640px]:gap-[8px]"
            }
          >
            <span>
              <span
                className={
                  'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
                }
              />{" "}
              Built on Solana · Devnet only
            </span>
            <div
              className={
                "merchant-footer-actions flex items-center gap-[20px] ml-auto [&>a]:min-h-[30px]"
              }
            >
              <a
                href={explorer(PROGRAM_ID.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                View program <ExternalLink size={12} />
              </a>
              <KeyboardShortcuts dashboard payments={page === "payments"} />
            </div>
          </footer>
        </main>
      </div>
    </SidebarProvider>
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
      if (manual) dismiss("balance-refresh");
      try {
        const next = await client.read(new PublicKey(active.account.address));
        if (mounted.current && isCurrent(active)) {
          setState(next);
          setReadError("");
          dismiss("balance-refresh");
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
    [active, isCurrent, notify, dismiss],
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
    if (!active) return;
    if (busy || pending) {
      dismiss(`transaction:${active.account.address}`);
      return;
    }
    if (!message) return;
    notify({
      id: `transaction:${active.account.address}`,
      title:
        receipt?.result === "confirmed"
          ? `${labels[receipt.transaction.action]} complete`
          : "Transaction needs attention",
      description: message,
      tone: receipt?.result === "confirmed" ? "success" : "error",
      href: receipt ? explorer(receipt.transaction.signature, "tx") : undefined,
    });
  }, [active, busy, pending, message, receipt, notify, dismiss]);

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
      <div
        className={
          "reserve-heading flex items-center justify-between mb-[13px] [&_.text-button]:text-[11px]"
        }
      >
        <span
          className={
            "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
          }
        >
          RESERVE POSITION
        </span>
        <Button
          variant="unstyled"
          size="unstyled"
          className={
            "text-button inline-flex items-center gap-[9px] text-[13px] font-[500] [background:none] [border:0] p-0 cursor-pointer [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover]:text-primary [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.left-hint)]:[transform:translateX(3px)] motion-reduce:[&>svg]:[transform:none]!"
          }
          onClick={() => void refresh(true)}
          data-shortcut="refresh"
          aria-keyshortcuts="Alt+Shift+R"
          aria-busy={refreshing}
          disabled={!active || refreshing || Boolean(busy)}
        >
          <RefreshCw
            size={13}
            className={
              refreshing
                ? "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                : ""
            }
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <div
        className={
          "reserve-stats grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-[14px] mb-[24px] max-[640px]:gap-[8px] max-[640px]:grid-cols-[1fr]"
        }
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
        <div
          className={
            "merchant-alert [border:1px_solid_#e6d9b6] bg-[#f9f5e8] text-[#78623b] text-[12px] leading-[1.7] py-[15px] px-[18px] rounded-[3px] mb-[20px] [overflow-wrap:anywhere]"
          }
          role="alert"
        >
          {readError} Displayed balances may be out of date; transfers are
          paused.
        </div>
      )}
      {journalError && (
        <div
          className={
            "merchant-alert [border:1px_solid_#e6d9b6] bg-[#f9f5e8] text-[#78623b] text-[12px] leading-[1.7] py-[15px] px-[18px] rounded-[3px] mb-[20px] [overflow-wrap:anywhere]"
          }
          role="alert"
        >
          {journalError}
        </div>
      )}
      {active && state && !state.ready && (
        <div
          className={
            "merchant-alert [border:1px_solid_#e6d9b6] bg-[#f9f5e8] text-[#78623b] text-[12px] leading-[1.7] py-[15px] px-[18px] rounded-[3px] mb-[20px] [overflow-wrap:anywhere]"
          }
          role="status"
        >
          The devnet program is awaiting deployment or initialization. Wallet
          balances are live; merchant transactions will unlock when it is ready.
        </div>
      )}
      {active && !active.wallet.signTransaction && (
        <div
          className={
            "merchant-alert [border:1px_solid_#e6d9b6] bg-[#f9f5e8] text-[#78623b] text-[12px] leading-[1.7] py-[15px] px-[18px] rounded-[3px] mb-[20px] [overflow-wrap:anywhere]"
          }
          role="alert"
        >
          This wallet does not support the required transaction signing. Connect
          a compatible Solana wallet such as Phantom.
        </div>
      )}
      <div
        className={
          "merchant-content-grid grid grid-cols-[minmax(0,_1.45fr)_minmax(290px,_1fr)] gap-[20px] mb-[20px] max-[1100px]:grid-cols-[minmax(0,_1.2fr)_minmax(270px,_1fr)] max-[1100px]:gap-[14px] max-[640px]:grid-cols-[1fr] max-[640px]:gap-[16px] max-[640px]:mb-[16px]"
        }
      >
        <Card
          as="section"
          className={
            "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px]"
          }
        >
          <CardHeader
            className={
              "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[#91a481]"
            }
          >
            <div>
              <span
                className={
                  "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
                }
              >
                GETTING STARTED
              </span>
              <h2>
                {loading
                  ? "Loading your reserve…"
                  : state?.registered
                    ? "A reserve you control."
                    : "Your first protected payment starts here."}
              </h2>
            </div>
            <ShieldCheck size={23} />
          </CardHeader>
          <div className={"onboarding-steps [margin:25px_0_22px]"}>
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
            <div
              className={
                "setup-footer [border-top:1px_solid_var(--line)] pt-[18px] flex items-center gap-[10px] flex-wrap text-primary [&>span]:text-[10px] [&>span]:text-muted-foreground [&_.button]:text-[11px] [&_.button]:min-h-[40px] max-[640px]:gap-[12px]"
              }
              role="status"
            >
              <LoaderCircle
                size={16}
                className={
                  "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                }
                aria-hidden="true"
              />
              <span>Checking your wallet connection…</span>
            </div>
          ) : !active ? (
            <div
              className={
                "setup-footer [border-top:1px_solid_var(--line)] pt-[18px] flex items-center gap-[10px] flex-wrap text-primary [&>span]:text-[10px] [&>span]:text-muted-foreground [&_.button]:text-[11px] [&_.button]:min-h-[40px] max-[640px]:gap-[12px]"
              }
            >
              <Wallet size={16} />
              <span>Connect your wallet in the top right to begin.</span>
            </div>
          ) : !state?.registered ? (
            <div
              className={
                "setup-footer [border-top:1px_solid_var(--line)] pt-[18px] flex items-center gap-[10px] flex-wrap text-primary [&>span]:text-[10px] [&>span]:text-muted-foreground [&_.button]:text-[11px] [&_.button]:min-h-[40px] max-[640px]:gap-[12px]"
              }
            >
              <Button
                variant="brand"
                size="unstyled"
                className={"button button-green"}
                disabled={!enabled || !state}
                onClick={() => void submit("register")}
              >
                {busy || pending || loading ? (
                  <LoaderCircle
                    size={15}
                    className={
                      "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                    }
                  />
                ) : (
                  <ArrowUpRight size={15} />
                )}
                {busy ||
                  (pending
                    ? "Confirming registration…"
                    : loading
                      ? "Loading merchant…"
                      : "Register merchant")}
              </Button>
              <span>One-time setup · Devnet SOL rent applies</span>
            </div>
          ) : (
            <div
              className={
                "setup-footer [border-top:1px_solid_var(--line)] pt-[18px] flex items-center gap-[10px] flex-wrap text-primary [&>span]:text-[10px] [&>span]:text-muted-foreground [&_.button]:text-[11px] [&_.button]:min-h-[40px] max-[640px]:gap-[12px]"
              }
            >
              <CheckCheck size={17} />
              <span>
                Merchant registered. Your wallet authorizes every reserve
                movement.
              </span>
            </div>
          )}
        </Card>
        <Card
          as="section"
          className={
            "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] transfer-card [&_label]:flex [&_label]:justify-between [&_label]:items-center [&_label]:text-[11px] [&_label_span]:[font:8px_var(--mono)] [&_label_span]:text-muted-foreground"
          }
        >
          <CardHeader
            className={
              "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[#91a481]"
            }
          >
            <div>
              <span
                className={
                  "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
                }
              >
                MOVE COLLATERAL
              </span>
              <h2>Manage your reserve</h2>
            </div>
            <ArrowDownLeft size={21} />
          </CardHeader>
          <div
            className={
              'transfer-tabs flex bg-[#f0f2eb] p-[4px] rounded-[4px] my-[21px] mx-0 gap-[4px] [&_button]:flex-[1] [&_button]:[border:1px_solid_transparent] [&_button]:bg-transparent [&_button]:text-[11px] [&_button]:p-[8px] [&_button]:rounded-[3px] [&_button]:text-muted-foreground [&_button]:[transition:background_0.2s,_box-shadow_0.2s] [&_button[aria-pressed="true"]]:bg-card [&_button[aria-pressed="true"]]:border-[#dce2d3] [&_button[aria-pressed="true"]]:shadow-[0_1px_3px_#24282008] [&_button[aria-pressed="true"]]:text-foreground'
            }
            role="group"
            aria-label="Reserve action"
          >
            <Button
              variant="unstyled"
              size="unstyled"
              aria-pressed={action === "fund"}
              onClick={() => {
                setAction("fund");
                setAmount("");
              }}
              disabled={Boolean(busy || pending)}
            >
              Add funds
            </Button>
            <Button
              variant="unstyled"
              size="unstyled"
              aria-pressed={action === "withdraw"}
              onClick={() => {
                setAction("withdraw");
                setAmount("");
              }}
              disabled={Boolean(busy || pending)}
            >
              Withdraw
            </Button>
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
            <div
              className={
                'reserve-amount [border:1px_solid_#d4dccb] flex items-center py-[15px] px-[13px] [margin:9px_0_12px] rounded-[3px] [&:focus-within]:border-[var(--green)] [&_input]:[border:0] [&_input]:bg-transparent [&_input]:w-[100%] [&_input]:min-w-[0] [&_input]:[font:24px_var(--mono)] [&_input]:text-foreground [&_input]:[outline:0] [&_input::placeholder]:text-[#b9c1b1] [&_button]:bg-[#eef3e7] [&_button]:[border:1px_solid_#dce5d2] [&_button]:rounded-[3px] [&_button]:[font:9px_var(--mono)] [&_button]:py-[5px] [&_button]:px-[7px] [&_button]:text-primary [&_input[aria-invalid="true"]]:[color:var(--danger)] [&:has(input[aria-invalid="true"])]:border-[var(--danger)]'
              }
            >
              <Input
                variant="embedded"
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
              <Button
                variant="unstyled"
                size="unstyled"
                type="button"
                onClick={() => setAmount(exactAmount(maxAmount))}
                disabled={
                  !state?.registered ||
                  maxAmount === 0n ||
                  Boolean(busy || pending)
                }
              >
                Max
              </Button>
            </div>
            <div
              className={
                "amount-balance flex gap-[10px] justify-between text-[10px] text-muted-foreground [&_strong]:font-[500] [&_strong]:[overflow-wrap:anywhere] [&_strong]:text-right"
              }
            >
              <span>
                {action === "fund" ? "In your wallet" : "Available to withdraw"}
              </span>
              <strong title={exactAmount(maxAmount)}>
                {state ? `${exactAmount(maxAmount)} USDC` : "—"}
              </strong>
            </div>
            <p
              id="amount-help"
              className={`transfer-help text-[10px] text-muted-foreground mt-[17px] min-h-[36px] [&.amount-error]:text-[#a04531] max-[640px]:min-h-[0] ${amount && !amountValid ? "amount-error" : ""}`}
            >
              {amount && !amountValid
                ? parsed > maxAmount
                  ? "Amount exceeds your available balance."
                  : "Enter a positive amount with up to 6 decimals."
                : action === "fund"
                  ? "Funds go directly into your merchant’s reserve vault."
                  : "Funds return to this wallet. Collateral backing open orders stays locked."}
            </p>
            <Button
              variant="ink"
              size="unstyled"
              className={
                "button button-dark transfer-submit w-[100%] mt-[15px] text-[12px] min-h-[43px]"
              }
              disabled={!enabled || !state?.registered || !amountValid}
            >
              {busy || pending ? (
                <LoaderCircle
                  size={15}
                  className={
                    "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                  }
                />
              ) : action === "fund" ? (
                <ArrowDownLeft size={15} />
              ) : (
                <ArrowUpRight size={15} />
              )}
              {busy ||
                (pending ? "Confirming transaction…" : undefined) ||
                (action === "fund" ? "Add to reserve" : "Withdraw to wallet")}
            </Button>
          </form>
          <div
            className={
              "transfer-security flex justify-center gap-[6px] items-center text-[9px] mt-[13px] text-muted-foreground"
            }
          >
            <LockKeyhole size={12} /> Approved by you. Enforced on-chain.
          </div>
        </Card>
      </div>
      {(pending || message) && (
        <div
          className={`transaction-notice flex justify-between gap-[14px] flex-wrap [border:1px_solid_#d9dfcf] bg-[#eef2e7] py-[16px] px-[20px] [margin:0_0_20px] rounded-[3px] text-[11px] [&>div]:flex [&>div]:gap-[10px] [&>div]:items-center [&>div]:flex-[1] [&>div]:min-w-[220px] [&_svg]:flex-[0_0_auto] [&_p]:[overflow-wrap:anywhere] [&_a]:flex [&_a]:items-center [&_a]:gap-[6px] [&_a]:text-primary ${receipt?.result === "confirmed" ? "transaction-confirmed border-[#c9dcb9] bg-[#edf6e7]" : ""}`}
        >
          <div>
            {pending ? (
              <LoaderCircle
                size={17}
                className={
                  "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                }
              />
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
      <div
        className={
          "merchant-bottom-grid grid grid-cols-[minmax(0,_1.45fr)_minmax(290px,_1fr)] gap-[20px] mb-[20px] max-[1100px]:grid-cols-[minmax(0,_1.2fr)_minmax(270px,_1fr)] max-[1100px]:gap-[14px] max-[640px]:grid-cols-[1fr] max-[640px]:gap-[16px] max-[640px]:mb-[16px]"
        }
      >
        <Card
          as="section"
          className={
            "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:tracking-[-0.4px] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] reserve-breakdown [&_h2]:text-[17px] [&:hover_.reserve-allocation]:animate-[reserve-drift_4s_linear_infinite] [&>p]:mt-[18px] [&>p]:text-[11px] [&>p]:text-muted-foreground motion-reduce:[&:hover_.reserve-allocation]:animate-[none]"
          }
        >
          <CardHeader
            className={
              "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[#91a481]"
            }
          >
            <div>
              <span
                className={
                  "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
                }
              >
                HOW YOUR RESERVE WORKS
              </span>
              <h2>Room for peace of mind.</h2>
            </div>
            <span
              className={
                "rate-badge [font:9px_var(--mono)] py-[6px] px-[8px] bg-[#eff4e9] text-primary [border:1px_solid_#dbe5d1] rounded-[3px] whitespace-nowrap max-[1100px]:text-[8px] max-[1100px]:p-[5px]"
              }
            >
              {state ? `${state.reserveBps / 100}%` : "5%"} reserve rate
            </span>
          </CardHeader>
          <div
            role="img"
            className={
              "reserve-allocation h-[25px] [border:1px_solid_#d3dec7] [background:repeating-linear-gradient(_125deg,_#e8f0df_0,_#e8f0df_6px,_#f4f7ee_6px,_#f4f7ee_9px_)] bg-size-[33px_42px] rounded-[3px] [margin:23px_0_12px] overflow-hidden [&>span]:block [&>span]:h-[100%] [&>span]:[transition:width_0.6s_ease] [&>span]:bg-[#a7884c] motion-reduce:[&>span]:transition-[none]"
            }
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
          <div
            className={
              "allocation-legend flex justify-between gap-[10px] text-[9px] text-muted-foreground [&_span]:flex [&_span]:items-center [&_span]:gap-[6px] [&_i]:bg-[#76945f] [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-[2px] [&_span:last-child_i]:bg-[#e8f0df] [&_span:last-child_i]:[border:1px_solid_#c6d4b8] [&_span:first-child_i]:bg-[#a7884c]"
            }
          >
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
            <div
              className={
                "merchant-chain-links flex flex-wrap gap-[17px] mt-[16px] [&_a]:flex [&_a]:items-center [&_a]:gap-[6px] [&_a]:text-[10px] [&_a]:text-primary"
              }
            >
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
        </Card>
        <Card
          as="section"
          className={
            "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] p-[25px] [&_h2]:tracking-[-0.4px] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] faucet-card bg-[#f0f3e9] [&_h2]:mt-[8px] [&_h2]:text-[18px] [&_p]:text-[11px] [&_p]:text-muted-foreground [&_p]:[margin:9px_0_17px] [&>a]:flex [&>a]:items-center [&>a]:justify-between [&>a]:py-[10px] [&>a]:px-0 [&>a]:[border-top:1px_solid_#dae2d0] [&>a]:text-[11px] [&>a:hover]:text-primary [&>a_svg]:[transition:transform_0.2s] [&>a:hover_svg]:[transform:translate(2px,_-2px)] motion-reduce:[&>a_svg]:transition-[none]"
          }
        >
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            A LITTLE TEST FUEL
          </span>
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
          <div
            className={
              "faucet-token flex flex-wrap gap-[8px] justify-between text-[9px] mt-[12px] text-muted-foreground [&>a]:inline-flex [&>a]:items-center [&>a]:gap-[5px] [&>a]:whitespace-nowrap [&>a]:min-h-[24px]"
            }
          >
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
        </Card>
      </div>
      {state && (
        <p
          className={
            "balance-timestamp [font:9px_var(--mono)] text-right text-muted-foreground [padding:4px_0_15px] max-[640px]:text-[8px] max-[640px]:text-left max-[640px]:leading-[1.6]"
          }
        >
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
    <Card
      as="section"
      className={`reserve-stat [border:1px_solid_var(--line)] bg-card py-[21px] px-[22px] rounded-[4px] [transition:border-color_0.2s,_transform_0.2s] [&:hover]:border-[#b4c5a4] [&:hover]:[transform:translateY(-2px)] [&>div]:flex [&>div]:justify-between [&>div]:gap-[8px] [&>div]:text-muted-foreground [&>div]:text-[11px] [&>div_svg]:text-[#7d8d70] [&>strong]:flex [&>strong]:gap-[9px] [&>strong]:items-baseline [&>strong]:[font:30px_var(--mono)] [&>strong]:tracking-[-1px] [&>strong]:[margin:22px_0_9px] [&>strong]:[overflow-wrap:anywhere] [&_strong_small]:[font:10px_var(--mono)] [&_strong_small]:tracking-[0] [&_strong_small]:text-muted-foreground [&_p]:text-[10px] [&_p]:text-muted-foreground max-[1100px]:py-[18px] max-[1100px]:px-[15px] max-[1100px]:[&>strong]:text-[25px] max-[640px]:p-[18px] max-[640px]:grid max-[640px]:grid-cols-[1fr_auto] max-[640px]:[gap:5px_15px] max-[640px]:[&>div]:justify-start max-[640px]:[&>div]:flex-row max-[640px]:[&>div]:[grid-column:1] max-[640px]:[&>div]:items-center max-[640px]:[&>div]:text-[11px] max-[640px]:[&>strong]:[grid-column:2] max-[640px]:[&>strong]:[grid-row:1_/_3] max-[640px]:[&>strong]:self-center max-[640px]:[&>strong]:m-0 max-[640px]:[&>strong]:text-[25px] max-[640px]:[&>strong_small]:text-[8px] max-[640px]:[&>div_svg]:order-[-1] max-[640px]:[&_p]:pl-[25px] max-[640px]:[&_p]:text-[9px] max-[370px]:[&>strong]:text-[20px] max-[370px]:[&>div]:text-[10px] motion-reduce:transition-[none] ${accent ? "reserve-stat-accent bg-[#edf2e5] border-[#d5dfc9] [&>strong]:text-primary" : ""}  ${tone ? `reserve-stat-${tone}` : ""}`}
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
            <span
              className={
                "balance-skeleton inline-block w-[86px] h-[30px] rounded-[3px] [background:linear-gradient(_100deg,_#dce2d580_25%,_#f4f6ee_50%,_#dce2d580_75%_)] bg-size-[200%_100%] animate-[balance-shimmer_1.8s_ease-in-out_infinite] motion-reduce:animate-[none]"
              }
              aria-hidden="true"
            />
            <span
              className={
                "sr-only absolute w-[1px] h-[1px] p-0 m-[-1px] overflow-hidden [clip-path:inset(50%)] whitespace-nowrap [border:0]"
              }
            >
              Loading balance
            </span>
          </>
        ) : amount === undefined ? (
          "—"
        ) : (
          formatUsdc(amount)
        )}
        <small>USDC</small>
      </strong>
      <p>{note}</p>
    </Card>
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
      className={`setup-step flex gap-[15px] relative [padding:0_0_27px] items-start [&:last-child]:pb-0 [&:not(:last-child)::after]:[content:""] [&:not(:last-child)::after]:absolute [&:not(:last-child)::after]:w-[1px] [&:not(:last-child)::after]:h-[calc(100%_-_37px)] [&:not(:last-child)::after]:top-[33px] [&:not(:last-child)::after]:left-[15px] [&:not(:last-child)::after]:bg-border [&_h3]:text-[13px] [&_h3]:[margin:3px_0_5px] [&_p]:text-[11px] [&_p]:text-muted-foreground [&_p]:leading-[1.6] ${done ? "step-done [&_.step-number]:text-primary [&_.step-number]:bg-[#e4eedb] [&_.step-number]:border-[#ceddc0]" : active ? "step-active [&_.step-number]:text-primary [&_.step-number]:border-[#a9bf94] [&_.step-number]:shadow-[0_0_0_4px_#f1f5ed]" : ""}`}
    >
      <span
        className={
          "step-number w-[31px] h-[31px] grid place-items-center flex-[0_0_auto] [border:1px_solid_var(--line)] bg-background rounded-[50%] [font:10px_var(--mono)] text-muted-foreground [transition:background_0.3s]"
        }
      >
        {done ? <Check size={15} /> : number}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {done && (
        <span
          className={
            "step-status [font:8px_var(--mono)] text-primary [margin:10px_0_0_auto]"
          }
        >
          DONE
        </span>
      )}
    </div>
  );
}
