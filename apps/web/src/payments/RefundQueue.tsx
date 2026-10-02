import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "../../convex/_generated/api";
import { connection, exactAmount } from "../merchant/client";
import type { WalletConnection } from "../lib/WalletControl";
import { paymentClient } from "./chain";
import { refundReasons } from "./refunds";
import { PaymentBoundary, usePaymentsReady } from "./PaymentProvider";

export function RefundQueue({ active }: { active: WalletConnection | null }) {
  const ready = usePaymentsReady();
  const [resolver, setResolver] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const value = await paymentClient(connection).readResolver();
        if (!stopped) {
          setResolver(value.toBase58());
          setError("");
        }
      } catch {
        if (!stopped) {
          setResolver("");
          setError(
            "Could not load the resolver queue. Retrying automatically…",
          );
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  if (!active || !ready) return null;
  if (error)
    return (
      <p role="status" className="my-4 text-xs text-muted-foreground">
        {error}
      </p>
    );
  if (active.account.address !== resolver) return null;
  return (
    <PaymentBoundary>
      <Queue />
    </PaymentBoundary>
  );
}
function Queue() {
  const links = useQuery(api.payments.refundQueue, {});
  const sync = useAction(api.paymentActions.sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    if (busy || !links) return;
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
    <Card
      as="section"
      className="my-6 p-5 sm:p-6"
      aria-labelledby="refund-queue-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
            RESOLVER / DEVNET
          </p>
          <h2 id="refund-queue-title" className="mt-2 text-lg font-medium">
            Refund requests
          </h2>
        </div>
        <Button
          variant="outline"
          disabled={busy || !links?.length}
          onClick={() => void refresh()}
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          Refresh queue
        </Button>
      </div>
      <p className="my-4 text-xs leading-6 text-muted-foreground">
        Review each receipt to approve a full refund or complete the order.
        Requests do not extend protection. Decisions require the configured
        resolver’s wallet signature.
      </p>
      {!links ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading requests…
        </p>
      ) : !links.length ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No refund requests awaiting review.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => (
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Protection ends{" "}
                  {new Date(link.receipt!.expiresAt).toLocaleString()}
                </p>
              </div>
              <Button asChild variant="outline">
                <a href={`/pay/${link._id}`}>
                  Review order
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {links?.length === 50 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Showing 50 pending orders, oldest payment links first. Resolve and
          refresh to see more.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
