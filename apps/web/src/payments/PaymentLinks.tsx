import { PaymentStatus } from "./PaymentStatus";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
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
import type { Doc } from "../../convex/_generated/dataModel";
import { type WalletConnection } from "../lib/WalletControl";
import { isWalletRejection, WalletRejected } from "../lib/wallets";
import { SessionErrorBoundary } from "../lib/useMerchantSession";
import { useToast } from "../lib/Toast";
import { exactAmount, parseAmount } from "../merchant/client";
import { paymentApproval, protectionLabel, type PaymentTerms } from "./terms";
import {
  PaymentBoundary,
  usePaymentsReady,
  paymentsConfigured,
} from "./PaymentProvider";

export function PaymentLinks(props: {
  active: WalletConnection | null;
  session: string | null;
  onSessionExpired: () => void;
  registered: boolean;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
  onPaid: () => void;
}) {
  const ready = usePaymentsReady();
  return (
    <Card
      as="section"
      className={
        "reserve-card min-w-[0] [border:1px_solid_var(--line)] rounded-[4px] bg-card p-[25px] [&_h2]:text-[18px] [&_h2]:tracking-[-0.4px] [&_h2]:leading-[1.5] [&_h2]:[margin:9px_0_0] [&_h2]:max-w-[300px] max-[1100px]:p-[20px] max-[640px]:p-[22px] max-[640px]:[&_h2]:text-[18px] max-[640px]:[&_h2]:max-w-[260px] payment-links my-[24px] [scroll-margin-top:24px]"
      }
      id="payment-links"
      aria-labelledby="payment-links-title"
    >
      <CardHeader
        className={
          "reserve-card-heading flex justify-between gap-[14px] items-start [&>svg]:text-[light-dark(#91a481,var(--primary))]"
        }
      >
        <div>
          <span
            className={
              "merchant-eyebrow [font:10px_var(--mono)] tracking-[1.2px] text-muted-foreground"
            }
          >
            PAYMENTS / DEVNET
          </span>
          <h2 id="payment-links-title">A link. A protected payment.</h2>
        </div>
        <Link2 size={22} aria-hidden="true" />
      </CardHeader>
      <p
        className={
          "payment-intro text-muted-foreground text-[12px] leading-[1.7] [margin:10px_0_24px]"
        }
      >
        Create a single-use checkout for test USDC. Share it with your buyer and
        follow the order here.
      </p>
      {!props.active ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
        >
          Connect your wallet to manage payment links.
        </div>
      ) : !props.registered ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
        >
          Register your merchant account in Overview to start accepting
          payments.
        </div>
      ) : !ready ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
          role="status"
        >
          {paymentsConfigured
            ? "Connecting to payment history…"
            : "Payment service is not configured for this deployment."}
        </div>
      ) : (
        <PaymentBoundary>
          <SessionErrorBoundary
            resetKey={props.session}
            onExpire={props.onSessionExpired}
          >
            <LinkManager {...props} active={props.active} />
          </SessionErrorBoundary>
        </PaymentBoundary>
      )}
    </Card>
  );
}
function LinkManager({
  active,
  session,
  locked,
  setLocked,
  isCurrent,
  onPaid,
}: {
  active: WalletConnection;
  session: string | null;
  locked: boolean;
  setLocked: (value: boolean) => void;
  isCurrent: (value: WalletConnection) => boolean;
  onPaid: () => void;
}) {
  const {
    results: links,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.payments.listForSession,
    session ? { session } : "skip",
    { initialNumItems: 20 },
  );
  const create = useAction(api.paymentActions.create);
  const sync = useAction(api.paymentActions.sync);
  const deactivate = useAction(api.paymentActions.deactivate);
  const reactivate = useMutation(api.payments.reactivate);
  const { notify } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [protection, setProtection] = useState(86400);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const [toggling, setToggling] = useState("");
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
      const details = description.trim().replace(/\r\n/g, "\n") || undefined;
      let request = approval.current;
      if (
        !request ||
        request.terms.title !== title.trim() ||
        request.terms.description !== details ||
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
          ...(details ? { description: details } : {}),
          amount: units,
          protectionSeconds: protection,
          issuedAt: Date.now(),
        };
        const message = paymentApproval(terms);
        setBusy("Approve link in your wallet…");
        let signature: string;
        try {
          signature = bs58.encode(
            await active.wallet.signMessage(active.account.address, message),
          );
        } catch (error) {
          if (isWalletRejection(error)) throw new WalletRejected();
          throw error;
        }
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
      setDescription("");
      setAmount("");
    } catch (error) {
      if (isCurrent(active))
        setError(
          error instanceof WalletRejected
            ? "Cancelled in your wallet. No payment link was created."
            : error instanceof ConvexError && typeof error.data === "string"
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
  const toggleLink = async (link: Doc<"paymentLinks">) => {
    if (!session || toggling || link.receipt) return;
    setToggling(link._id);
    try {
      if (link.deactivatedAt) {
        await reactivate({ session, id: link._id });
        notify({
          title: "Payment link reactivated",
          description: "The checkout page accepts payments again.",
        });
      } else {
        await deactivate({ session, id: link._id });
        notify({
          title: "Payment link deactivated",
          description: "The checkout page no longer accepts payments.",
        });
      }
    } catch (error) {
      notify({
        title: "Could not update the link",
        description:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : "Try again.",
        tone: "error",
      });
    } finally {
      setToggling("");
    }
  };
  return (
    <>
      <form
        className={
          "payment-link-form grid grid-cols-[minmax(160px,_1.5fr)_minmax(110px,_0.8fr)_minmax(_120px,_0.8fr_)] gap-[16px] [&_label]:flex [&_label]:flex-col [&_label]:gap-[9px] [&_label]:text-[12px] [&_label]:text-muted-foreground [&_input]:w-[100%] [&_input]:min-w-[0] [&_input]:min-h-[44px] [&_input]:py-[11px] [&_input]:px-[12px] [&_input]:[border:1px_solid_var(--line)] [&_input]:rounded-[4px] [&_input]:bg-card [&_input]:text-foreground [&_input]:[font:inherit] [&_select]:w-[100%] [&_select]:min-w-[0] [&_select]:min-h-[44px] [&_select]:py-[11px] [&_select]:px-[12px] [&_select]:[border:1px_solid_var(--line)] [&_select]:rounded-[4px] [&_select]:bg-card [&_select]:text-foreground [&_select]:[font:inherit] [&_input:focus]:border-primary [&_select:focus]:border-primary [&>button]:[grid-column:1_/_-1] [&>button]:justify-self-start max-[640px]:grid-cols-[1fr_1fr] max-[640px]:[&_label:first-child]:[grid-column:1_/_-1] max-[640px]:[&>button]:justify-self-stretch max-[640px]:[&>button]:justify-center"
        }
        onSubmit={(event) => {
          event.preventDefault();
          void createLink();
        }}
        aria-busy={Boolean(busy)}
      >
        <label>
          Payment for
          <Input
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
          <Input
            required
            inputMode="decimal"
            value={amount}
            disabled={Boolean(busy)}
            onChange={(event) => setAmount(event.target.value)}
            id="payment-link-amount"
            placeholder="10.00"
          />
        </label>
        <label>
          Protection period
          <NativeSelect
            value={protection}
            disabled={Boolean(busy)}
            onChange={(event) => setProtection(Number(event.target.value))}
          >
            <NativeSelectOption value={3600}>1 hour</NativeSelectOption>
            <NativeSelectOption value={86400}>1 day</NativeSelectOption>
            <NativeSelectOption value={604800}>7 days</NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="[grid-column:1_/_-1]">
          <span className="flex justify-between gap-[12px]">
            Description (optional)
            <span className="[font:10px_var(--mono)]">
              {description.length}/500
            </span>
          </span>
          <Textarea
            maxLength={500}
            value={description}
            disabled={Boolean(busy)}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is the buyer paying for? Shown on the checkout page."
            rows={3}
            className={
              "min-h-[72px] w-full min-w-0 resize-y rounded-[4px] [border:1px_solid_var(--line)] bg-card px-[12px] py-[11px] text-[13px] text-foreground shadow-none [font:inherit] focus-visible:border-primary"
            }
          />
        </label>
        <Button
          variant="brand"
          size="unstyled"
          className={"button button-green"}
          disabled={locked || Boolean(busy) || !active.wallet.signMessage}
          type="submit"
        >
          {busy ? (
            <LoaderCircle
              size={16}
              className={
                "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
              }
            />
          ) : (
            <Link2 size={16} />
          )}
          {busy || "Create payment link"}
        </Button>
      </form>
      <p
        className={
          "payment-fineprint text-muted-foreground my-[14px] mx-0 text-[11px]"
        }
      >
        Your wallet signs the link details. No funds move. Titles and on-chain
        receipts are public; keep personal information out.
      </p>
      {!active.wallet.signMessage && (
        <p
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          This wallet does not support message approval. Switch to a wallet such
          as Phantom to create links.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className={
            "payment-error py-[13px] px-[15px] [border:1px_solid_light-dark(#e9cdc4,var(--border))] bg-[light-dark(#fbf0eb,var(--secondary))] text-[light-dark(#964b36,var(--danger))] text-[12px] leading-[1.7] rounded-[4px] [overflow-wrap:anywhere] my-[14px] mx-0"
          }
        >
          {error}
        </p>
      )}
      <div
        className={
          "payment-history-heading mt-[30px] [border-top:1px_solid_var(--line)] pt-[24px] flex items-center justify-between gap-[14px] [&_h3]:text-[14px] [&_h3]:font-[500] [&_h3_span]:text-muted-foreground [&_h3_span]:ml-[7px] [&_h3_span]:[font:11px_var(--mono)] max-[640px]:items-start"
        }
      >
        <h3>
          Recent payment links{" "}
          <span>{status === "LoadingFirstPage" ? "" : links.length}</span>
        </h3>
        <Button
          variant="unstyled"
          size="unstyled"
          className={
            "payment-text-button inline-flex items-center gap-[7px] text-muted-foreground bg-transparent [border:0] text-[11px] py-[10px] px-0"
          }
          type="button"
          data-shortcut="refresh-orders"
          disabled={status === "LoadingFirstPage" || checking}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={14}
            className={
              checking
                ? "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                : ""
            }
          />
          {checking ? "Checking orders…" : "Refresh orders"}
        </Button>
      </div>
      {status === "LoadingFirstPage" ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
          role="status"
        >
          Loading payment links…
        </div>
      ) : links.length === 0 ? (
        <div
          className={
            "payment-empty flex flex-col items-center text-center gap-[9px] py-[32px] px-[18px] text-muted-foreground text-[12px] bg-[light-dark(#f6f7f2,var(--secondary))] [border:1px_dashed_var(--line)] rounded-[4px] mt-[14px] leading-[1.7] [&_strong]:text-foreground [&_strong]:font-[500]"
          }
        >
          <Link2 size={24} />
          <strong>Your first payment starts here.</strong>
          <span>
            Create a link above, then share it with a buyer on devnet.
          </span>
        </div>
      ) : (
        <ul
          className={
            "payment-link-list [list-style:none] p-0 [margin:10px_0_0] [&_li]:flex [&_li]:items-center [&_li]:gap-[18px] [&_li]:py-[18px] [&_li]:px-[12px] [&_li]:rounded-[4px] [&_li]:[border-bottom:1px_solid_var(--line)] [&_li]:[transition:background-color_180ms_ease] [&_li:hover]:bg-[light-dark(#f8f9f5,var(--card))] [&_li:last-child]:[border-bottom:0] max-[640px]:[&_li]:gap-[10px] max-[640px]:[&_li]:flex-wrap"
          }
        >
          {links.map((link) => (
            <li key={link._id}>
              <div
                className={
                  "payment-link-details min-w-[0] flex-[1] flex flex-col gap-[7px] [&>a]:inline-flex [&>a]:items-center [&>a]:gap-[6px] [&>a]:text-[13px] [&>a]:[overflow-wrap:anywhere] [&>span]:text-muted-foreground [&>span]:text-[10px] [&>.payment-order-link]:inline-flex [&>.payment-order-link]:gap-[5px] [&>.payment-order-link]:items-center [&>.payment-order-link]:text-[light-dark(#476238,var(--primary))] [&>.payment-order-link]:text-[11px] max-[640px]:[flex-basis:calc(100%_-_48px)]"
                }
              >
                <a href={`/pay/${link._id}`}>
                  {link.title}
                  <ArrowUpRight size={14} />
                </a>
                {link.description && (
                  <span className="line-clamp-1 max-w-[420px] text-muted-foreground">
                    {link.description}
                  </span>
                )}
                <span>
                  {protectionLabel(link.protectionSeconds)} protection ·{" "}
                  {new Date(link._creationTime).toLocaleDateString()}
                </span>
                {link.receipt && (
                  <a
                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    href={`/pay/${link._id}`}
                  >
                    Manage order <ArrowUpRight size={12} />
                  </a>
                )}
                {link.refundPending && (
                  <span className="text-xs text-amber-800">
                    Refund requested · awaiting resolver
                  </span>
                )}
              </div>
              <div
                className={
                  "payment-link-summary flex flex-col items-end gap-[8px] [&_strong]:text-[14px] [&_strong]:font-[500] [&_small]:text-muted-foreground [&_small]:[font:9px_var(--mono)] max-[640px]:order-[3] max-[640px]:flex-row max-[640px]:justify-between max-[640px]:items-center max-[640px]:w-[100%]"
                }
              >
                <strong>
                  {exactAmount(BigInt(link.amount))} <small>USDC</small>
                </strong>
                {link.deactivatedAt && !link.receipt ? (
                  <Badge
                    variant="outline"
                    className="link-payment-status rounded-[3px] border-0 bg-secondary px-[7px] py-[5px] font-mono text-[9px] font-normal text-muted-foreground"
                  >
                    Inactive
                  </Badge>
                ) : (
                  <PaymentStatus receipt={link.receipt} />
                )}
                {!link.receipt && (
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    className={
                      "payment-text-button inline-flex items-center gap-[7px] text-muted-foreground bg-transparent [border:0] text-[11px] py-[4px] px-0"
                    }
                    type="button"
                    disabled={Boolean(toggling)}
                    onClick={() => void toggleLink(link)}
                  >
                    {toggling === link._id ? (
                      <LoaderCircle
                        size={12}
                        className={
                          "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                        }
                      />
                    ) : null}
                    {link.deactivatedAt ? "Reactivate" : "Deactivate"}
                  </Button>
                )}
              </div>
              <Button
                variant="unstyled"
                size="unstyled"
                className={
                  "payment-copy w-[38px] h-[38px] grid place-items-center [border:1px_solid_var(--line)] bg-card rounded-[4px] text-muted-foreground shrink-[0] [transition:background-color_180ms_ease] [&:hover]:bg-[light-dark(#eaf0e2,var(--secondary))] [&:hover]:text-[light-dark(#476238,var(--primary))]"
                }
                aria-label={`Copy payment link for ${link.title}`}
                title="Copy payment link"
                disabled={Boolean(link.deactivatedAt && !link.receipt)}
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
              </Button>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          variant="unstyled"
          size="unstyled"
          className={
            "payment-text-button inline-flex items-center gap-[7px] text-muted-foreground bg-transparent [border:0] text-[11px] py-[10px] px-0 mt-[10px]"
          }
          type="button"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? (
            <LoaderCircle
              size={14}
              className={
                "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
              }
            />
          ) : null}
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </>
  );
}
