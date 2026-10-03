import { ThemeControl } from "@/lib/Theme";
import type { FunctionReturnType } from "convex/server";
import { MerchantAvatar } from "../merchant/MerchantAvatar";
import { OrderActions } from "./OrderActions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useConvex, useQuery } from "convex/react";
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
import { PaymentSteps } from "./PaymentSteps";
import {
  loadPayment,
  savePayment,
  clearPayment,
  type PendingPayment,
} from "./pending";
import {
  canRetry,
  inFlight as phaseBusy,
  phaseNote,
  type CheckoutPhase,
} from "./checkout-phase";
import { isWalletRejection } from "../lib/wallets";

// Declining the wallet prompt is a normal choice, so it gets its own
// phase instead of the generic error path.
class WalletRejected extends Error {}

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
    <div
      className={
        "merchant-shell min-h-[100vh] m-auto [border-inline:1px_solid_var(--line)] checkout-shell max-w-[none] max-[640px]:[&_.merchant-header]:gap-[14px] max-[640px]:[&_.merchant-header]:py-[18px] max-[640px]:[&_.merchant-header]:px-[16px] max-[640px]:[&_.merchant-header]:flex-wrap max-[640px]:[&_.merchant-header-actions]:gap-[12px] max-[640px]:[&_.merchant-header_.brand]:text-[20px] max-[640px]:[&_.merchant-footer]:gap-[18px]"
      }
    >
      <a
        className={
          "skip-link [clip-path:inset(50%)] fixed left-[16px] top-[-60px] z-[10] bg-foreground text-background p-[12px] [&:focus]:[clip-path:none] [&:focus]:top-[12px]"
        }
        href="#checkout-main"
      >
        Skip to payment
      </a>
      <header
        className={
          "merchant-header min-h-[88px] flex items-center gap-[34px] py-[20px] px-[34px] [border-bottom:1px_solid_var(--line)] bg-card max-[860px]:min-h-[78px] max-[860px]:py-[16px] max-[860px]:px-[24px] max-[640px]:p-[16px] max-[640px]:gap-[8px] max-[640px]:flex-wrap max-[640px]:[&_.brand]:text-[17px] max-[640px]:[&_.brand-mark]:w-[24px] max-[640px]:[&_.brand-mark]:h-[24px] max-[640px]:[&_.wallet-button]:min-h-[37px] max-[640px]:[&_.wallet-button]:text-[10px] max-[640px]:[&_.wallet-button]:gap-[6px] max-[640px]:[&_.wallet-button]:py-0 max-[640px]:[&_.wallet-button]:px-[10px]"
        }
      >
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
        <div
          className={
            "merchant-header-actions ml-auto flex items-center gap-[23px] max-[640px]:gap-[10px]"
          }
        >
          <span
            className={
              "network-badge inline-flex gap-[7px] items-center [font:11px_var(--mono)] [color:var(--info)] [&>span]:w-[6px] [&>span]:h-[6px] [&>span]:rounded-[50%] [&>span]:bg-[light-dark(#709155,var(--primary))] [&>span]:[background:var(--info)] [&>span]:shadow-[0_0_0_3px_var(--info-soft)] max-[640px]:text-[9px] max-[640px]:gap-[4px] max-[370px]:hidden"
            }
          >
            <span />
            Devnet
          </span>
          <ThemeControl />
          <WalletControl onChange={onChange} locked={locked} />
        </div>
      </header>
      <main
        id="checkout-main"
        className={
          "checkout-main max-w-[620px] my-0 mx-auto [padding:52px_24px_24px] max-[640px]:[padding:32px_16px_16px]"
        }
        tabIndex={-1}
      >
        <div
          className={
            "checkout-heading mb-[24px] [&_h1]:text-[clamp(28px,_5vw,_38px)] [&_h1]:tracking-[-1.5px] [&_h1]:font-[500] [&_h1]:leading-[1.18] [&_h1]:my-[14px] [&_h1]:mx-0 [&_h1_em]:not-italic [&_h1_em]:text-[light-dark(#6d8254,var(--primary))] [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[1.6]"
          }
        >
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            RESERVEPAY / CHECKOUT
          </span>
          <h1>
            A little more <em>peace of mind.</em>
          </h1>
          <p>A direct payment, backed by the merchant’s reserve.</p>
        </div>
        <div
          className={
            "devnet-notice flex gap-[10px] py-[13px] px-[16px] [border:1px_solid_light-dark(#dce5d3,var(--border))] bg-[light-dark(#edf2e7,var(--secondary))] rounded-[3px] mb-[29px] [background:var(--info-soft)] border-[light-dark(#d5e0e7,var(--border))] [&_p]:text-[11px] [&_p]:text-[light-dark(#626e57,var(--muted-foreground))] [&_p]:leading-[1.6] [&_p]:[color:var(--info)] [&_strong]:font-[500] [&_strong]:text-[light-dark(#3e5133,var(--primary))] [&_strong]:[color:var(--info)] max-[640px]:p-[12px] max-[640px]:mb-[22px] max-[640px]:items-start"
          }
        >
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
            <Card
              as="section"
              className={
                "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] checkout-card p-[32px] mt-[20px] [&_h2]:text-[24px] [&_h2]:font-[500] [&_h2]:my-[12px] [&_h2]:mx-0 [&_h2]:[overflow-wrap:anywhere] [&_h2]:tracking-[-0.6px] [&>p]:leading-[1.7] [&>p]:text-muted-foreground max-[640px]:py-[24px] max-[640px]:px-[20px]"
              }
              role="status"
            >
              {paymentsConfigured ? (
                <>
                  <LoaderCircle
                    size={24}
                    className={
                      "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                    }
                  />{" "}
                  Loading payment details…
                </>
              ) : (
                "Payment service is not configured for this deployment."
              )}
            </Card>
          )}
        </PaymentBoundary>
        <footer
          className={
            "merchant-footer flex justify-between gap-[14px] py-[23px] px-0 [border-top:1px_solid_var(--line)] mt-[29px] [font:9px_var(--mono)] text-muted-foreground items-center flex-wrap [&_span]:inline-flex [&_span]:gap-[7px] [&_span]:items-center [&_a]:inline-flex [&_a]:gap-[7px] [&_a]:items-center max-[640px]:text-[8px] max-[640px]:gap-[8px]"
          }
        >
          <span>
            <span
              className={
                'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[light-dark(#608a4b,var(--primary))] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[light-dark(#8c9185,var(--primary))]'
              }
            />
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
  const convex = useConvex();
  const merchantProfile = useQuery(
    api.merchants.publicProfile,
    link ? { wallet: link.merchant } : "skip",
  );
  const sync = useAction(api.paymentActions.sync);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [journalError, setJournalError] = useState("");
  const [phase, setPhase] = useState<CheckoutPhase>({ kind: "ready" });
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
        const saved = loadPayment(id);
        setPending(saved);
        setJournalError("");
        // A saved journal means a signed transaction may be in flight;
        // resume at the confirmation step and let the poll loop refine it.
        // If the journal disappeared (another tab settled it), leave the
        // journal-tracking phases so Pay is enabled again.
        setPhase((phase) =>
          saved
            ? { kind: "confirming" }
            : ["confirming", "verifying", "unavailable"].includes(phase.kind)
              ? { kind: "ready" }
              : phase,
        );
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
        } else if (pending) {
          const result = await transactionResult(connection, pending);
          if (stopped) return;
          if (result === "failed" || result === "expired") {
            clearPayment(id);
            setPending(null);
            setPhase({ kind: result });
          } else
            setPhase({
              kind: result === "confirmed" ? "verifying" : "confirming",
            });
        }
      } catch {
        // Only a pending payment depends on these checks. Without one a
        // failed check must not disable Pay or overwrite states like
        // rejected; with one, the next successful check moves the phase on.
        if (!stopped && pending) setPhase({ kind: "unavailable" });
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
      link.deactivatedAt ||
      !active?.wallet.signTransaction ||
      pending ||
      !loaded ||
      journalError ||
      inFlight.current
    )
      return;
    const wallet = active;
    // Tracks how far the payment got so an error marks the step that
    // actually failed instead of always marking Review.
    let stage: "review" | "approve" | "send" = "review";
    // Re-read the link: a tab loaded before the merchant deactivated or
    // the link was paid must not pay. The live query usually wins this
    // race; re-checking closes the rest of it.
    const requirePayable = async () => {
      const fresh = await convex.query(api.payments.get, { id });
      if (!fresh || fresh.deactivatedAt)
        throw new Error("This payment link is no longer active.");
      if (fresh.receipt) throw new Error("This link has already been paid.");
    };
    const execute = async () => {
      const saved = loadPayment(id);
      if (saved) {
        setPending(saved);
        throw new Error("This payment is already awaiting confirmation.");
      }
      await requirePayable();
      const prepared = await paymentClient(connection).prepare(
        link,
        new PublicKey(wallet.account.address),
      );
      if (!isCurrent(wallet))
        throw new Error("Wallet changed. Nothing was submitted.");
      stage = "approve";
      setPhase({ kind: "approving" });
      let bytes: Uint8Array;
      try {
        bytes = await wallet.wallet.signTransaction!(
          wallet.account.address,
          new Uint8Array(
            prepared.transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            }),
          ),
        );
      } catch (error) {
        // A rejection happens before anything is saved or sent.
        if (isWalletRejection(error)) throw new WalletRejected();
        throw error;
      }
      if (!isCurrent(wallet))
        throw new Error("Wallet changed. Nothing was submitted.");
      const signed = validateSignedTransaction(prepared.transaction, bytes);
      // The wallet prompt can stay open for minutes; check again before
      // anything is persisted or sent.
      await requirePayable();
      const record = {
        signature: signed.signature,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        buyer: wallet.account.address,
      };
      // Persist before broadcast. If storage is unavailable, no transaction is sent.
      stage = "send";
      savePayment(id, record);
      setPending(record);
      setPhase({ kind: "sending" });
      try {
        await connection.sendRawTransaction(signed.bytes, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
        setPhase({ kind: "confirming" });
      } catch {
        setPhase({ kind: "confirming", uncertain: true });
      }
    };
    inFlight.current = true;
    setLocked(true);
    setPhase({ kind: "preparing" });
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
      if (mounted.current) {
        if (error instanceof WalletRejected) setPhase({ kind: "rejected" });
        else {
          const description =
            error instanceof Error
              ? error.message
              : "Payment could not be prepared.";
          setPhase({ kind: "error", message: description, at: stage });
          notify({
            title: "Payment needs attention",
            description,
            tone: "error",
          });
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setLocked(false);
    }
  };
  if (link === undefined)
    return (
      <Card
        as="section"
        className={
          "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] checkout-card p-[32px] mt-[20px] [&_h2]:text-[24px] [&_h2]:font-[500] [&_h2]:my-[12px] [&_h2]:mx-0 [&_h2]:[overflow-wrap:anywhere] [&_h2]:tracking-[-0.6px] [&>p]:leading-[1.7] [&>p]:text-muted-foreground max-[640px]:py-[24px] max-[640px]:px-[20px]"
        }
        role="status"
      >
        Loading payment details…
      </Card>
    );
  if (!link)
    return (
      <Card
        as="section"
        className={
          "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] checkout-card p-[32px] mt-[20px] [&_h2]:text-[24px] [&_h2]:font-[500] [&_h2]:my-[12px] [&_h2]:mx-0 [&_h2]:[overflow-wrap:anywhere] [&_h2]:tracking-[-0.6px] [&>p]:leading-[1.7] [&>p]:text-muted-foreground max-[640px]:py-[24px] max-[640px]:px-[20px]"
        }
      >
        <h2>Payment link not found.</h2>
        <p>Check the URL or ask the merchant for their payment link.</p>
      </Card>
    );
  if (link.receipt)
    return (
      <Receipt
        merchantProfile={merchantProfile}
        link={link}
        active={active}
        setLocked={setLocked}
        isCurrent={isCurrent}
      />
    );
  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] checkout-card p-[32px] mt-[20px] [&_h2]:text-[24px] [&_h2]:font-[500] [&_h2]:my-[12px] [&_h2]:mx-0 [&_h2]:[overflow-wrap:anywhere] [&_h2]:tracking-[-0.6px] [&>p]:leading-[1.7] [&>p]:text-muted-foreground max-[640px]:py-[24px] max-[640px]:px-[20px]"
      }
      aria-busy={phaseBusy(phase)}
    >
      {/* Always mounted so the first phase change is announced too; the
          visible notices are plain text so updates are read exactly once. */}
      <span className="sr-only" role="status" aria-live="polite">
        {phaseNote(phase) ?? ""}
      </span>
      <span
        className={
          "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
        }
      >
        PAYMENT FOR
      </span>
      <h2>{link.title}</h2>
      {link.description && (
        <p className="whitespace-pre-line break-words text-muted-foreground">
          {link.description}
        </p>
      )}
      {merchantProfile && (
        <div className="mb-3 flex items-center gap-3">
          <MerchantAvatar
            url={merchantProfile.imageUrl}
            name={merchantProfile.displayName}
            className="size-11"
          />
          <p
            className={
              "checkout-merchant min-w-0 break-words text-[13px] text-muted-foreground [margin:0_0_4px] [&_strong]:text-foreground [&_strong]:font-[500] [&_a]:text-primary"
            }
          >
            Pay <strong>{merchantProfile.displayName}</strong>
            {merchantProfile.website && (
              <>
                {" · "}
                <a
                  href={merchantProfile.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  {merchantProfile.website.replace(/^https:\/\//, "")}
                </a>
              </>
            )}
          </p>
        </div>
      )}
      <div
        className={
          "checkout-amount text-[clamp(32px,_7vw,_46px)] tracking-[-1.8px] font-[500] my-[24px] mx-0 [overflow-wrap:anywhere] [&>span]:[font:12px_var(--mono)] [&>span]:text-muted-foreground [&>span]:ml-[10px] [&>span]:tracking-[0]"
        }
      >
        {exactAmount(BigInt(link.amount))}
        <span>USDC</span>
      </div>
      <dl
        className={
          "checkout-details [border-block:1px_solid_var(--line)] py-[10px] px-0 [margin:0_0_22px] [&>div]:flex [&>div]:justify-between [&>div]:items-baseline [&>div]:gap-[24px] [&>div]:py-[10px] [&>div]:px-0 [&>div]:text-[12px] [&_dt]:text-muted-foreground [&_dt]:shrink-[0] [&_dd]:m-0 [&_dd]:text-right [&_dd]:min-w-[0] [&_dd]:leading-[1.6] max-[640px]:[&>div]:gap-[12px]"
        }
      >
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
              className={
                "payment-address [font:10px_var(--mono)] [overflow-wrap:anywhere] [&_svg]:inline [&_svg]:[vertical-align:middle] [&_svg]:ml-[4px]"
              }
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
      <div
        className={
          "checkout-protection flex gap-[12px] p-[16px] bg-[light-dark(#edf1e7,var(--secondary))] text-[light-dark(#4b653c,var(--primary))] rounded-[4px] mb-[24px] [&_svg]:shrink-[0] [&_svg]:mt-[2px] [&_p]:text-[11px] [&_p]:leading-[1.8] [&_p]:m-0"
        }
      >
        <ShieldCheck size={20} />
        <p>
          The merchant’s reserve backs the full payment during your protection
          period. Request a refund from your receipt before protection ends.
          Refunds require an authorized resolver’s approval.
        </p>
      </div>
      {link.deactivatedAt && !pending ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
          role="status"
        >
          <strong>This payment link is no longer active.</strong>
          <span>Contact the merchant for a new link. No payment was taken.</span>
        </div>
      ) : (
        <>
          {phase.kind !== "ready" && <PaymentSteps phase={phase} />}
          {!active && (
            <p
              className={
                "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
              }
            >
              Connect your wallet above to continue.
            </p>
          )}
          {active && !active.wallet.signTransaction && (
            <p
              className={
                "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
              }
            >
              This wallet does not support devnet transaction signing. Switch
              wallets to continue.
            </p>
          )}
          {active?.account.address === link.merchant && (
            <p
              className={
                "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
              }
            >
              You’re viewing your own link. Share it with a buyer using another
              wallet.
            </p>
          )}
          <Button
            variant="brand"
            size="unstyled"
            className={"button button-green checkout-pay w-[100%] mt-[12px]"}
            disabled={
              !active?.wallet.signTransaction ||
              active?.account.address === link.merchant ||
              Boolean(pending || journalError) ||
              !canRetry(phase) ||
              !loaded
            }
            onClick={() => void pay()}
          >
            {phaseBusy(phase) || pending ? (
              <LoaderCircle
                size={17}
                className={
                  "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                }
              />
            ) : (
              <LockKeyhole size={16} />
            )}
            {pending
              ? "Payment in progress…"
              : phase.kind === "preparing"
                ? "Checking balance and reserve…"
                : phase.kind === "approving"
                  ? "Approve payment in your wallet…"
                  : phase.kind === "sending"
                    ? "Sending to Solana…"
                    : phase.kind !== "ready" && canRetry(phase)
                      ? "Try again"
                      : `Pay ${exactAmount(BigInt(link.amount))} USDC`}
          </Button>
        </>
      )}
      <p
        className={
          "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
        }
      >
        A network fee and account rent in devnet SOL are shown in your wallet.
        Each link accepts one payment.
      </p>
      {(phase.kind === "error" || journalError) && (
        <p
          role="alert"
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          {phase.kind === "error" ? phase.message : journalError}
        </p>
      )}
      {(phase.kind === "failed" || phase.kind === "expired") && (
        <p
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          {phaseNote(phase)}
        </p>
      )}
      {(phase.kind === "rejected" ||
        phase.kind === "confirming" ||
        phase.kind === "verifying" ||
        phase.kind === "unavailable") && (
        <p
          className={
            "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
          }
        >
          {phaseNote(phase)}
        </p>
      )}
      {pending && (
        <a
          className={
            "payment-order-link inline-flex gap-[5px] items-center text-[light-dark(#476238,var(--primary))] text-[11px]"
          }
          href={explorer(pending.signature, "tx")}
          target="_blank"
          rel="noreferrer"
        >
          View pending transaction <ArrowUpRight size={13} />
        </a>
      )}
    </Card>
  );
}
function Receipt({
  merchantProfile,
  link,
  active,
  setLocked,
  isCurrent,
}: {
  merchantProfile:
    | FunctionReturnType<typeof api.merchants.publicProfile>
    | undefined;
  link: Doc<"paymentLinks">;
  active: WalletConnection | null;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
}) {
  const receipt = link.receipt!;
  const buyer = active?.account.address;
  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] checkout-card p-[32px] mt-[20px] [&_h2]:text-[24px] [&_h2]:font-[500] [&_h2]:my-[12px] [&_h2]:mx-0 [&_h2]:[overflow-wrap:anywhere] [&_h2]:tracking-[-0.6px] [&>p]:leading-[1.7] [&>p]:text-muted-foreground max-[640px]:py-[24px] max-[640px]:px-[20px] checkout-receipt [&>.merchant-eyebrow]:block [&>.merchant-eyebrow]:mt-[18px]"
      }
    >
      <span
        className={
          "receipt-check grid place-items-center w-[54px] h-[54px] bg-[light-dark(#eaf0e2,var(--secondary))] text-[light-dark(#476238,var(--primary))] rounded-[50%]"
        }
      >
        <Check size={28} />
      </span>
      <span
        className={
          "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
        }
      >
        VERIFIED ON SOLANA DEVNET
      </span>
      <h2>
        {receipt.status === "refunded"
          ? "Payment refunded."
          : receipt.status === "completed"
            ? "Order completed."
            : "Payment received."}
      </h2>
      <p>{link.title}</p>
      {link.description && (
        <p className="whitespace-pre-line break-words text-muted-foreground">
          {link.description}
        </p>
      )}
      {merchantProfile && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <MerchantAvatar
            url={merchantProfile.imageUrl}
            name={merchantProfile.displayName}
          />
          <span className="min-w-0 break-words">
            {merchantProfile.displayName}
          </span>
        </div>
      )}
      <div
        className={
          "checkout-amount text-[clamp(32px,_7vw,_46px)] tracking-[-1.8px] font-[500] my-[24px] mx-0 [overflow-wrap:anywhere] [&>span]:[font:12px_var(--mono)] [&>span]:text-muted-foreground [&>span]:ml-[10px] [&>span]:tracking-[0]"
        }
      >
        {exactAmount(BigInt(link.amount))}
        <span>USDC</span>
      </div>
      {buyer && buyer !== receipt.buyer && (
        <p
          className={
            "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
          }
        >
          This link was paid by a different wallet.
        </p>
      )}
      <dl
        className={
          "checkout-details [border-block:1px_solid_var(--line)] py-[10px] px-0 [margin:0_0_22px] [&>div]:flex [&>div]:justify-between [&>div]:items-baseline [&>div]:gap-[24px] [&>div]:py-[10px] [&>div]:px-0 [&>div]:text-[12px] [&_dt]:text-muted-foreground [&_dt]:shrink-[0] [&_dd]:m-0 [&_dd]:text-right [&_dd]:min-w-[0] [&_dd]:leading-[1.6] max-[640px]:[&>div]:gap-[12px]"
        }
      >
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
          <dd
            className={
              "payment-address [font:10px_var(--mono)] [overflow-wrap:anywhere] [&_svg]:inline [&_svg]:[vertical-align:middle] [&_svg]:ml-[4px]"
            }
          >
            {receipt.buyer}
          </dd>
        </div>
      </dl>
      <OrderActions
        link={link}
        active={active}
        setLocked={setLocked}
        isCurrent={isCurrent}
      />
      <Button asChild variant="brand" size="unstyled">
        <a
          className={"button button-green checkout-pay w-[100%] mt-[12px]"}
          href={explorer(receipt.order)}
          target="_blank"
          rel="noreferrer"
        >
          View on-chain order <ArrowUpRight size={16} />
        </a>
      </Button>
      <p
        className={
          "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
        }
      >
        Keep this URL as your receipt. The merchant can see the same confirmed
        order in their dashboard.
      </p>
    </Card>
  );
}
