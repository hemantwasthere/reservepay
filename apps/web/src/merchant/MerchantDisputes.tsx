import { useEffect, useState } from "react";
import { useAction, usePaginatedQuery } from "convex/react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "../../convex/_generated/api";
import { exactAmount } from "./client";
import type { WalletConnection } from "../lib/WalletControl";
import { refundReasons } from "../payments/refunds";
import { useResolver } from "../payments/useResolver";
import { PaymentBoundary, usePaymentsReady } from "../payments/PaymentProvider";

const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;

function deadline(expiresAt: number, now: number) {
  const ms = expiresAt - now;
  if (ms <= 0)
    return { text: "Overdue — decide now", tone: "overdue" as const };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24)
    return {
      text: hours < 1 ? "Under 1h left" : `${hours}h left`,
      tone: "soon" as const,
    };
  return {
    text: `Ends ${new Date(expiresAt).toLocaleDateString()}`,
    tone: "calm" as const,
  };
}

export function MerchantDisputes({ active }: { active: WalletConnection | null }) {
  const ready = usePaymentsReady();
  const { resolver, error, checking } = useResolver();
  if (!ready) return null;
  if (error)
    return (
      <p role="status" className="my-4 text-xs text-muted-foreground">
        {error}
      </p>
    );
  if (checking)
    return (
      <p role="status" className="my-4 text-xs text-muted-foreground">
        Checking the protocol resolver…
      </p>
    );
  // UI gating only, not a security boundary: the on-chain has_one = resolver
  // constraint gates decisions, and the queue is public data.
  if (!active || active.account.address !== resolver)
    return (
      <Card className="my-6 p-6">
        <p className="text-sm text-muted-foreground" role="status">
          This page is for the protocol resolver.
          {!active && " Connect a wallet to continue."}
        </p>
      </Card>
    );
  return (
    <PaymentBoundary>
      <Disputes />
    </PaymentBoundary>
  );
}

function Disputes() {
  const { results: links, status, loadMore } = usePaginatedQuery(
    api.payments.refundQueuePage,
    {},
    { initialNumItems: 20 },
  );
  const sync = useAction(api.paymentActions.sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 15_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const refresh = async () => {
    if (busy || !links.length) return;
    setBusy(true);
    setError("");
    try {
      for (const link of links) await sync({ id: link._id });
    } catch {
      setError("Some orders could not be refreshed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card as="section" className="my-6 p-5 sm:p-6" aria-labelledby="disputes-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            RESOLVER / DEVNET
          </p>
          <h2 id="disputes-title" className="mt-2 text-lg font-medium">
            Refund requests
          </h2>
        </div>
        <Button
          variant="outline"
          disabled={busy || !links.length}
          onClick={() => void refresh()}
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>
      <p className="my-4 text-xs leading-6 text-muted-foreground">
        Soonest protection deadline first. Open the order to approve a full
        refund or reject it and complete the order. Requests do not extend
        protection; expired undisputed orders release automatically.
      </p>
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading requests…
        </p>
      ) : !links.length ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No refund requests awaiting review.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => {
            const badge = deadline(link.receipt!.expiresAt, now);
            return (
              <li
                key={link._id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <a
                    className="text-sm font-medium break-words underline-offset-4 hover:underline"
                    href={`/pay/${link._id}`}
                  >
                    {link.title}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {refundReasons[link.refundRequest!.reason]} ·{" "}
                    {exactAmount(BigInt(link.amount))} USDC
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Buyer {short(link.receipt!.buyer)} · Merchant{" "}
                    {short(link.merchant)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-[3px] border px-2 py-1 font-mono text-[10px] whitespace-nowrap ${
                      badge.tone === "overdue"
                        ? "border-[light-dark(#e4c5b8,var(--border))] bg-[light-dark(#f9ece5,var(--warning-soft))] text-[light-dark(#a04531,var(--danger))]"
                        : badge.tone === "soon"
                          ? "border-[light-dark(#e6d9b6,var(--border))] bg-[light-dark(#f9f5e8,var(--warning-soft))] text-[light-dark(#78623b,var(--warning))]"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {badge.text}
                  </span>
                  <Button asChild variant="outline">
                    <a href={`/pay/${link._id}`}>
                      Open order
                      <ArrowUpRight className="size-4" />
                    </a>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
